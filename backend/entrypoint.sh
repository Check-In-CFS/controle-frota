#!/bin/sh
# Roda o comando recebido por um shell: assim "$PORT" (e outras variaveis) sao expandidas
# mesmo quando a hospedagem passa o comando de inicio sem shell.
exec sh -c "$*"
