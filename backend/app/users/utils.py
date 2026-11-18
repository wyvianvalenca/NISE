import re

# Mesma regra de frontend/lib/email.ts (RF-S2.03): parte local, arroba e um
# domínio com ponto e final de 2 letras ou mais. Existe por causa de
# "alana@gmail", um erro comum e silencioso: ela acha que digitou certo e
# nunca recebe nada.
_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$")


def is_valid_email(email: str) -> bool:
    return _EMAIL_PATTERN.match(email.strip()) is not None
