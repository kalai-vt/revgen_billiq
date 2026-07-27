from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from app.core.admin_db import AdminBase, admin_database_url
from app import models_admin  # noqa: F401  (registers all models on AdminBase.metadata)

config = context.config
config.set_main_option("sqlalchemy.url", admin_database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = AdminBase.metadata


# Distinct from the billing chain's `alembic_version` table — the admin database is normally
# a separate Postgres instance, but nothing stops an operator from pointing both connection
# strings at the same instance (e.g. to consolidate infra), and both chains would otherwise
# fight over the same tracking table if they shared a schema.
ADMIN_VERSION_TABLE = "alembic_version_admin"


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table=ADMIN_VERSION_TABLE,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, version_table=ADMIN_VERSION_TABLE
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
