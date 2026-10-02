from django.db import models


class DatabaseUUID(models.Func):
    function = "UUID"
    output_field = models.UUIDField()

    def as_postgresql(self, compiler, connection, **extra_context):
        return self.as_sql(compiler, connection, function="gen_random_uuid", **extra_context)
