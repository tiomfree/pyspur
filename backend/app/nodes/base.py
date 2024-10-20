from abc import ABC, abstractmethod
from pydantic import BaseModel, ValidationError, create_model
from typing import (
    Any,
    Type,
    Union,
    Tuple,
    Dict,
    List,
)


DynamicSchemaValueType = str
TSchemaValue = Type[
    Union[int, float, str, bool, List[Any], Dict[Any, Any], Tuple[Any, ...]]
]


class BaseNode(ABC):
    """
    Base class for all nodes.
    """

    name: str

    config_model: Type[BaseModel]
    input_model: Type[BaseModel]
    output_model: Type[BaseModel]

    _config: BaseModel

    def __init__(self, config: BaseModel) -> None:
        self._config = config
        self.setup()

    @abstractmethod
    def setup(self) -> None:
        """
        Setup method to define `config_model`, `input_model`, and `output_model`.
        For dynamic schemas, these can be created based on `self.config`.
        """

    async def __call__(self, input_data: BaseModel) -> BaseModel:
        """
        Validates `input_data` against `input_model`, runs the node's logic,
        and validates the output against `output_model`.
        """
        try:
            input_validated = self.input_model.model_validate(input_data)
        except ValidationError as e:
            raise ValueError(f"Input data validation error in {self.name}: {e}")

        result = await self.run(input_validated)

        try:
            output_validated = self.output_model.model_validate(result)
        except ValidationError as e:
            raise ValueError(f"Output data validation error in {self.name}: {e}")

        return output_validated

    @abstractmethod
    async def run(self, input_data: Any) -> Any:
        """
        Abstract method where the node's core logic is implemented.
        Should return an instance compatible with `output_model`.
        """
        pass

    @property
    def config(self) -> Any:
        """
        Return the node's configuration.
        """
        return self.config_model.model_validate(self._config.model_dump())

    @staticmethod
    def _get_python_type(
        value_type: DynamicSchemaValueType,
    ) -> Type[Union[int, float, str, bool, List[Any], Dict[Any, Any], Tuple[Any, ...]]]:
        """
        Parse the value_type string into an actual Python type.
        Supports arbitrarily nested types like 'int', 'list[int]', 'dict[str, int]', 'list[dict[str, list[int]]]', etc.
        """

        def parse_type(
            s: str,
        ) -> TSchemaValue:
            s = s.strip().lower()
            if s == "int":
                return int
            elif s in ("int", "float", "str", "bool"):
                return {"int": int, "float": float, "str": str, "bool": bool}[s]
            elif s == "dict":
                return Dict[Any, Any]
            elif s == "list":
                return List[Any]
            elif s.startswith("list[") and s.endswith("]"):
                inner_type_str = s[5:-1]
                inner_type = parse_type(inner_type_str)
                return List[inner_type]
            elif s.startswith("dict[") and s.endswith("]"):
                inner_types_str = s[5:-1]
                key_type_str, value_type_str = split_types(inner_types_str)
                key_type = parse_type(key_type_str)
                value_type = parse_type(value_type_str)
                return Dict[key_type, value_type]
            else:
                raise ValueError(f"Unsupported type: {s}")

        def split_types(s: str) -> Tuple[str, str]:
            """
            Splits the string s at the top-level comma, correctly handling nested brackets.
            """
            depth = 0
            start = 0
            splits: List[str] = []
            for i, c in enumerate(s):
                if c == "[":
                    depth += 1
                elif c == "]":
                    depth -= 1
                elif c == "," and depth == 0:
                    splits.append(s[start:i].strip())
                    start = i + 1
            splits.append(s[start:].strip())
            if len(splits) != 2:
                raise ValueError(f"Invalid dict type specification: {s}")
            return splits[0], splits[1]

        return parse_type(value_type)

    @classmethod
    def get_model_for_schema_dict(
        cls,
        schema: Dict[str, DynamicSchemaValueType],
        schema_name: str,
        base_model: Type[BaseModel] = BaseModel,
    ) -> Type[BaseModel]:
        """
        Create a Pydantic model from a schema dictionary.
        """
        schema_processed = {k: cls._get_python_type(v) for k, v in schema.items()}
        schema_type_dict = {k: (v, ...) for k, v in schema_processed.items()}
        return create_model(
            schema_name,
            **schema_type_dict,  # type: ignore
            __base__=base_model,
        )
