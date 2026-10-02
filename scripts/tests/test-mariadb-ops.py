import importlib
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
common = importlib.import_module('mariadb_common')
installer = importlib.import_module('mariadb_install')
maintenance = importlib.import_module('mariadb_native')


class NativeDatabaseGuards(unittest.TestCase):
    def test_low_docker_disk_space_stops_before_build_backup_or_writes(self):
        from unittest.mock import Mock

        context = Mock()
        context.runtime = {'APP_ENV': 'production', 'SEED_DEMO': 'false'}
        context.capture.return_value = json.dumps({'services': {'api': {}, 'web': {}, 'operator': {}}})
        with tempfile.TemporaryDirectory() as storage:
            usage = type('Usage', (), {'free': maintenance.MIN_BUILD_FREE_BYTES - 1})()
            with patch.object(maintenance.os, 'geteuid', return_value=0), patch.object(maintenance, 'revision'), patch.object(maintenance, 'output', return_value=storage), patch.object(maintenance.shutil, 'disk_usage', return_value=usage), patch.object(maintenance, 'sql') as query, patch.object(maintenance, 'backup') as backup:
                with self.assertRaisesRegex(ValueError, '5 GiB'):
                    maintenance.deploy(context)
                context.execute.assert_not_called()
                query.assert_not_called()
                backup.assert_not_called()

    def test_build_space_accepts_exact_threshold(self):
        with tempfile.TemporaryDirectory() as storage:
            usage = type('Usage', (), {'free': maintenance.MIN_BUILD_FREE_BYTES})()
            with patch.object(maintenance, 'output', return_value=storage), patch.object(maintenance.shutil, 'disk_usage', return_value=usage) as measured:
                maintenance.verify_build_space()
                measured.assert_called_once_with(pathlib.Path(storage).resolve())

    def test_resume_waits_for_existing_container_without_compose_version_specific_flags(self):
        from unittest.mock import Mock

        context = object.__new__(common.Context)
        context.execute = Mock()
        context.capture = Mock(return_value='original-container-id')
        with patch.object(common, 'output', side_effect=['starting', 'healthy']) as inspect, patch.object(common.time, 'sleep'):
            context.resume()
        context.execute.assert_called_once_with('start', 'api')
        self.assertEqual(inspect.call_count, 2)
        for call in inspect.call_args_list:
            self.assertEqual(call.args[0][-1], 'original-container-id')

    def test_database_identifiers_and_credentials_are_not_sql(self):
        for value in ('club;DROP', 'postgres', 'club_`', 'club_a\n', 'club_' + 'a' * 64):
            with self.subTest(value=value), self.assertRaises(ValueError):
                common.database_name(value)
        with patch.object(common, 'sql') as query:
            with self.assertRaises(ValueError):
                common.create_database('club_test', 'club_ops', 'bad\x27password')
            query.assert_not_called()

    def test_existing_database_is_never_replaced(self):
        with patch.object(common, 'sql', return_value='1') as query:
            with self.assertRaises(ValueError):
                common.create_database('club_test', 'club_ops', 'a' * 64)
            self.assertEqual(query.call_count, 1)
            self.assertTrue(query.call_args.args[0].startswith('SELECT'))

    def test_archives_reject_traversal_links_duplicates_and_missing_files(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = pathlib.Path(temp)
            for mode in ('traversal', 'link', 'duplicate', 'missing'):
                archive = directory / (mode + '.tar.gz')
                with tarfile.open(archive, 'w:gz') as destination:
                    member = tarfile.TarInfo('../escape' if mode == 'traversal' else 'data')
                    member.size = 1
                    if mode == 'link':
                        member.type = tarfile.SYMTYPE
                        member.linkname = '/etc/passwd'
                    destination.addfile(member, io.BytesIO(b'x') if mode != 'link' else None)
                    if mode == 'duplicate':
                        destination.addfile(member, io.BytesIO(b'x'))
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    common.extract_archive(archive, directory / 'out', {'data', 'required'} if mode == 'missing' else None)
            self.assertFalse((directory.parent / 'escape').exists())

    def test_extract_size_is_bounded_before_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = pathlib.Path(temp)
            archive = directory / 'oversized.tar.gz'
            with tarfile.open(archive, 'w:gz') as destination:
                member = tarfile.TarInfo('data')
                member.size = 2
                destination.addfile(member, io.BytesIO(b'xx'))
            with self.assertRaises(ValueError):
                common.extract_archive(archive, directory / 'out', maximum=1)
            self.assertFalse((directory / 'out').exists())

    def test_restore_preparation_rejects_shared_ports_before_database_creation(self):
        context = type('Source', (), {'runtime': {'PUBLIC_URL': 'https://localhost:9443'}})()
        with tempfile.TemporaryDirectory() as temp, patch.object(installer, 'create_database') as create:
            for port, mail_port in ((9443, 8125), (9543, 9543), (9543, 9544), (65535, 8125)):
                with self.subTest(port=port, mail=mail_port), self.assertRaises(ValueError):
                    installer.prepare_restore(context, pathlib.Path(temp) / 'new', port, mail_port)
            create.assert_not_called()

    def test_repeat_install_preserves_closed_configuration(self):
        with tempfile.TemporaryDirectory() as temp:
            config = pathlib.Path(temp).resolve()
            for name in installer.FILES:
                (config / name).write_text(json.dumps({'version': 2, 'stack': 'mariadb', 'mode': 'local'}) if name == 'install.json' else 'preserved')
                (config / name).chmod(0o600)
            before = {name: (config / name).read_bytes() for name in installer.FILES}
            context = type('Stand', (), {'runtime': {'PUBLIC_URL': 'https://localhost:9443'}, 'lock': lambda self: __import__('contextlib').nullcontext()})()
            with patch.object(installer, 'Context', return_value=context), patch.object(maintenance, 'deploy') as deploy, patch('builtins.print'):
                installer.install(config, True)
                deploy.assert_called_once_with(context)
            self.assertEqual(before, {name: (config / name).read_bytes() for name in installer.FILES})


if __name__ == '__main__':
    unittest.main()
