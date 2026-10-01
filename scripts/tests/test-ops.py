import copy
import importlib.util
import pathlib
import sys
import unittest

helpers = pathlib.Path(__file__).resolve().parents[1] / 'lib'
sys.path.insert(0, str(helpers))
spec = importlib.util.spec_from_file_location('restore_config', helpers / 'restore-config.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RestoreGuards(unittest.TestCase):
    def setUp(self):
        self.config = {'name':'club-restore-test','volumes':{name:{'name':'club-restore-test_'+name} for name in ('pgdata','uploads')},'services':{
            'api':{'environment':{'JOBS_ENABLED':'false','SEED_DEMO':'false','SMTP_HOST':'mailpit','OFFICE_NOTIFY_CHANNEL':'email','PUBLIC_URL':'https://localhost:9443'},'volumes':[{'type':'volume','source':'uploads','target':'/data/uploads'}]},
            'postgres':{'volumes':[{'type':'volume','source':'pgdata','target':'/var/lib/postgresql/data'}]},
            'mailpit':{},'caddy':{'ports':[{'host_ip':'127.0.0.1','published':'9443'}]}}}
        self.config['services']['api']['environment'].update(CHECKOUT_DATABASE_URL='postgresql://club_api:synthetic@postgres:5432/club_test')
        self.config['services']['postgres']['environment']={'POSTGRES_DB':'club_test','POSTGRES_USER':'owner','POSTGRES_PASSWORD':'owner_synthetic'}
        self.config['services']['bootstrap']={'environment':{'PGHOST':'postgres','PGDATABASE':'club_test','PGUSER':'owner','PGPASSWORD':'owner_synthetic'}}
        self.config['services']['migrate']={'environment':{**self.config['services']['bootstrap']['environment'],'CHECKOUT_DB_USER':'club_api','CHECKOUT_DB_PASSWORD':'synthetic'}}
        self.config['services']['bootstrap']['environment']['SEED_DEMO']='false'
        self.config['networks']={'default':{'name':'club-restore-test_default','internal':True}}
        for service in self.config['services'].values(): service['networks']={'default':None}

    def test_fresh_named_volumes(self): module.validate(self.config, lambda _:False)

    def test_reject_existing_even_without_labels(self):
        with self.assertRaisesRegex(ValueError,'уже существует'): module.validate(self.config, lambda _:True)

    def test_reject_bind_or_external_data(self):
        for service in ('postgres','api'):
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

    def test_reject_redirected_database_name_or_network(self):
        for service in ('api','migrate','bootstrap','postgres'):
            for key,value in (('extra_hosts',['postgres=192.0.2.10']),('network_mode','host'),('networks',{'browser':None})):
                bad=copy.deepcopy(self.config);bad['services'][service][key]=value
                with self.subTest(service=service,key=key), self.assertRaises(ValueError): module.validate(bad,lambda _:False)
        for key,value in (('external',True),('internal',False),('name','production_default')):
            bad=copy.deepcopy(self.config);bad['networks']['default'][key]=value
            with self.subTest(key=key), self.assertRaises(ValueError): module.validate(bad,lambda _:False)
        bad=copy.deepcopy(self.config);bad['services']['migrate']['environment']['PGHOSTADDR']='192.0.2.10'
        with self.assertRaises(ValueError): module.validate(bad,lambda _:False)

    def test_reject_bootstrap_demo(self):
        self.config['services']['bootstrap']['environment']['SEED_DEMO']='true'
        with self.assertRaises(ValueError): module.validate(self.config,lambda _:False)

    def test_reject_external_or_privileged_runtime(self):
        for service,key,value in (
                ('api','CHECKOUT_DATABASE_URL','postgresql://club_api:synthetic@production.internal:5432/club_test'),
                ('api','CHECKOUT_DATABASE_URL','postgresql://owner:owner_synthetic@postgres:5432/club_test'),
                ('api','CHECKOUT_DATABASE_URL','postgresql://club_api:synthetic@postgres:5432/another_db'),
                ('bootstrap','PGHOST','production.internal'),
                ('bootstrap','PGDATABASE','another_db')):
            bad=copy.deepcopy(self.config);bad['services'][service]['environment'][key]=value
            with self.subTest(service=service,key=key,value=value), self.assertRaises(ValueError): module.validate(bad,lambda _:False)


if __name__ == '__main__': unittest.main()
