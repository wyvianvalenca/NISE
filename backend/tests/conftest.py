import os

# Os testes não usam o banco de verdade, mas importar o app cria o engine,
# que exige um DATABASE_URL. Este é fictício; o engine só conecta quando usado.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost:5432/teste"
)
