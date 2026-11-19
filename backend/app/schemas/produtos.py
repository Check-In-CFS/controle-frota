from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ProdutoCreate(BaseModel):
    nome: str = Field(..., min_length=2, max_length=200)
    unidade_medida: str = Field("un", min_length=1, max_length=10)
    estoque_minimo: Optional[float] = Field(None, ge=0)

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        return " ".join(v.split())


class ProdutoUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=2, max_length=200)
    unidade_medida: Optional[str] = Field(None, min_length=1, max_length=10)
    estoque_minimo: Optional[float] = Field(None, ge=0)
    ativo: Optional[bool] = None

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: Optional[str]) -> Optional[str]:
        return " ".join(v.split()) if v else v


class Produto(BaseModel):
    id: int
    nome: str
    unidade_medida: str
    estoque_atual: float
    estoque_minimo: Optional[float] = None
    ativo: bool
    abaixo_minimo: bool = False


class Retirada(BaseModel):
    quantidade: float = Field(..., gt=0)
    maquina_id: Optional[int] = None
    manutencao_id: Optional[int] = None
    observacao: Optional[str] = Field(None, max_length=500)


class Ajuste(BaseModel):
    """Correção de saldo (contagem física). Positivo soma, negativo subtrai."""
    quantidade: float
    motivo: str = Field(..., min_length=3, max_length=500)

    @field_validator("quantidade")
    @classmethod
    def _diferente_de_zero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("Informe uma quantidade diferente de zero")
        return v


class EntradaItem(BaseModel):
    item_id: int
    quantidade: float = Field(..., gt=0)
    produto_id: Optional[int] = None   # produto do catálogo...
    novo_produto: bool = False         # ...ou cria um com o nome do item


class EntradaMercadoria(BaseModel):
    itens: list[EntradaItem] = Field(..., min_length=1)
    observacao: Optional[str] = Field(None, max_length=500)


class Movimento(BaseModel):
    id: int
    tipo: str
    quantidade: float
    usuario_nome: str
    observacao: Optional[str] = None
    created_at: datetime
    nota_fiscal_id: Optional[int] = None
    nota_numero: Optional[str] = None
    manutencao_id: Optional[int] = None
    maquina_codigo: Optional[str] = None
