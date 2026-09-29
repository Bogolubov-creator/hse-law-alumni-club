"""Регрессии опасных вариантов restore; тесты не создают контейнеров и томов."""
import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('restore_config', pathlib.Path(__file__).with_name('restore-config.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RestoreGuards(unittest.TestCase):
    def setUp(self):
        self.config = {'name':'club-restore-test','volumes':{name:{'name':'club-restore-test_'+name} for name in ('pgdata','uploads')},'services':{
            'api':{'environment':{'JOBS_ENABLED':'false','SEED_DEMO':'false','SMTP_HOST':'mailpit','OFFICE_NOTIFY_CHANNEL':'email','PUBLIC_URL':'https://localhost:9443'}},
            'postgres':{'volumes':[{'type':'volume','source':'pgdata','target':'/var/lib/postgresql/data'}]},
            'directus':{'volumes':[{'type':'volume','source':'uploads','target':'/directus/uploads'}]},
            'mailpit':{},'caddy':{'ports':[{'host_ip':'127.0.0.1','published':'9443'}]}}}
        self.config['services']['api']['environment'].update(DIRECTUS_URL='http://directus:8055',CHECKOUT_DATABASE_URL='postgresql://club_api:synthetic@postgres:5432/club_test')
        self.config['services']['postgres']['environment']={'POSTGRES_DB':'club_test','POSTGRES_USER':'owner','POSTGRES_PASSWORD':'owner_synthetic'}
        self.config['services']['directus']['environment']={'DB_HOST':'postgres','DB_PORT':'5432','DB_DATABASE':'club_test','DB_USER':'owner','DB_PASSWORD':'owner_synthetic'}
        self.config['services']['migrate']={'environment':{'CHECKOUT_DB_USER':'club_api','CHECKOUT_DB_PASSWORD':'synthetic'}}

    def test_fresh_named_volumes(self): module.validate(self.config, lambda _:False)

    def test_reject_existing_even_without_labels(self):
        with self.assertRaisesRegex(ValueError,'уже существует'): module.validate(self.config, lambda _:True)

    def test_reject_bind_or_external_data(self):
        for service in ('postgres','directus'):
            bad=copy.deepcopy(self.config)
            bad['services'][service]['volumes'][0].update(type='bind',source='/var/lib/production')
            with self.subTest(service=service), self.assertRaises(ValueError): module.validate(bad,lambda _:False)
        self.config['volumes']['pgdata']['external']=True
        with self.assertRaises(ValueError): module.validate(self.config,lambda _:False)

    def test_reject_bind_volume_driver(self):
        self.config['volumes']['pgdata']['driver_opts']={'type':'none','o':'bind','device':'/var/lib/production'}
        with self.assertRaises(ValueError): module.validate(self.config,lambda _:False)

    def test_reject_external_side_effects(self):
        for key,value in (('JOBS_ENABLED','true'),('SMTP_HOST','smtp.example.com'),('YOOKASSA_SECRET_KEY','present')):
            bad=copy.deepcopy(self.config);bad['services']['api']['environment'][key]=value
            with self.subTest(key=key), self.assertRaises(ValueError): module.validate(bad,lambda _:False)

    def test_reject_public_port(self):
        self.config['services']['caddy']['ports'][0]['host_ip']='0.0.0.0'
        with self.assertRaises(ValueError): module.validate(self.config,lambda _:False)

    def test_reject_external_or_privileged_runtime(self):
        for service,key,value in (
                ('api','DIRECTUS_URL','https://production.internal'),
                ('api','CHECKOUT_DATABASE_URL','postgresql://club_api:synthetic@production.internal:5432/club_test'),
                ('api','CHECKOUT_DATABASE_URL','postgresql://owner:owner_synthetic@postgres:5432/club_test'),
                ('api','CHECKOUT_DATABASE_URL','postgresql://club_api:synthetic@postgres:5432/another_db'),
                ('directus','DB_HOST','production.internal'),
                ('directus','DB_DATABASE','another_db')):
            bad=copy.deepcopy(self.config);bad['services'][service]['environment'][key]=value
            with self.subTest(service=service,key=key,value=value), self.assertRaises(ValueError): module.validate(bad,lambda _:False)


if __name__ == '__main__': unittest.main()
