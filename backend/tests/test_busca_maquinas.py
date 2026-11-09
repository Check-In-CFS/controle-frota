from tests.conftest import cabecalho


def _filtro_or(banco):
    for consulta in banco.consultas:
        for metodo, args, _ in consulta.chamadas:
            if metodo == "or_":
                return args[0]
    return None


def test_busca_normal_vai_entre_aspas(client, banco):
    client.get("/maquinas?busca=trator", headers=cabecalho("admin"))
    assert _filtro_or(banco) == (
        'codigo.ilike."%trator%",numero_patrimonial.ilike."%trator%",'
        'marca.ilike."%trator%",modelo.ilike."%trator%"'
    )


def test_busca_com_virgula_e_parenteses_nao_vira_outro_filtro(client, banco):
    client.get("/maquinas", params={"busca": "x),ativo.eq.false,(y"}, headers=cabecalho("admin"))
    filtro = _filtro_or(banco)
    # tudo que foi digitado continua dentro das aspas de cada coluna
    assert filtro.count('"%x),ativo.eq.false,(y%"') == 4


def test_busca_com_aspas_e_barra_sao_escapadas(client, banco):
    client.get("/maquinas", params={"busca": 'a"b\\c'}, headers=cabecalho("admin"))
    assert '"%a\\"b\\\\c%"' in _filtro_or(banco)
