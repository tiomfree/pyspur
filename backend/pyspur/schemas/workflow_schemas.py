from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator, model_validator


class SpurType(str, Enum):
    """Enum representing the type of spur.

    Workflow: Standard workflow with nodes and edges
    Chatbot: Essentially a workflow with chat compatible IO and session management
    Agent: Autonomous agent node that calls tools, also has chat compatible IO
        and session management
    """

    WORKFLOW = "workflow"
    CHATBOT = "chatbot"
    AGENT = "agent"


class WorkflowNodeCoordinatesSchema(BaseModel):
    """Coordinates for a node in a workflow."""

    x: float
    y: float


class WorkflowNodeDimensionsSchema(BaseModel):
    """Dimensions for a node in a workflow."""

    width: float
    height: float


class WorkflowNodeSchema(BaseModel):
    """A single step in a workflow.

    Each node receives a dictionary mapping predecessor node IDs to their outputs.
    For dynamic schema nodes, the output schema is defined in the config dictionary.
    For static schema nodes, the output schema is defined in the node class implementation.
    """

    id: str  # ID in the workflow
    title: str = ""  # Display name
    parent_id: Optional[str] = None  # ID of the parent node
    node_type: str  # Name of the node type
    config: Dict[
        str, Any
    ] = {}  # Configuration parameters including dynamic output schema if needed
    coordinates: Optional[WorkflowNodeCoordinatesSchema] = (
        None  # Position of the node in the workflow
    )
    dimensions: Optional[WorkflowNodeDimensionsSchema] = (
        None  # Dimensions of the node in the workflow
    )
    subworkflow: Optional["WorkflowDefinitionSchema"] = None  # Sub-workflow definition

    @model_validator(mode="after")
    @classmethod
    def default_title_to_id(cls, model):
        if model.title.strip() == "":
            model.title = model.id
        return model

    @model_validator(mode="after")
    @classmethod
    def prefix_model_name_with_provider(cls, model):
        # We need this to handle spurs created earlier than the prefixing change
        if model.node_type in ("SingleLLMCallNode", "BestOfNNode"):
            llm_info = model.config.get("llm_info")
            assert llm_info is not None
            if (
                llm_info["model"].startswith("gpt")
                or llm_info["model"].startswith("chatgpt")
                or llm_info["model"].startswith("o1")
            ):
                llm_info["model"] = f"openai/{llm_info['model']}"
            if llm_info["model"].startswith("claude"):
                llm_info["model"] = f"anthropic/{llm_info['model']}"
        return model


class WorkflowLinkSchema(BaseModel):
    """Connect a source node to a target node.

    The target node will receive the source node's output in its input dictionary.
    """

    source_id: str
    target_id: str
    source_handle: Optional[str] = None  # The output handle from the source node
    target_handle: Optional[str] = None  # The input handle on the target node


class WorkflowDefinitionSchema(BaseModel):
    """A workflow is a DAG of nodes."""

    nodes: List[WorkflowNodeSchema]
    links: List[WorkflowLinkSchema]
    test_inputs: List[Dict[str, Any]] = []
    spur_type: SpurType = SpurType.WORKFLOW

    @classmethod
    @field_validator("nodes")
    def nodes_must_have_unique_ids(cls, v: List[WorkflowNodeSchema]):
        node_ids = [node.id for node in v]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("Node IDs must be unique.")
        return v

    @classmethod
    @field_validator("nodes")
    def must_have_one_and_only_one_input_node(cls, v: List[WorkflowNodeSchema]):
        input_nodes = [
            node for node in v if node.node_type == "InputNode" and node.parent_id is None
        ]
        if len(input_nodes) != 1:
            raise ValueError("Workflow must have exactly one input node.")
        return v

    @classmethod
    @field_validator("nodes")
    def must_have_at_most_one_output_node(cls, v: List[WorkflowNodeSchema]):
        output_nodes = [
            node for node in v if node.node_type == "OutputNode" and node.parent_id is None
        ]
        if len(output_nodes) > 1:
            raise ValueError("Workflow must have at most one output node.")
        return v

    @model_validator(mode="after")
    @classmethod
    def validate_router_node_links(cls, model):
        """Validate links connected to RouterNodes.

        They must have correctly formatted target handles.
        For RouterNodes, the target handle should match the format: source_node_id.handle_id
        """
        for link in model.links:
            source_node = next((node for node in model.nodes if node.id == link.source_id), None)
            if source_node and source_node.node_type == "RouterNode":
                target_handle = link.target_handle or link.source_id

                # If target_handle contains a dot, take only what's after the dot
                if target_handle.find(".") != -1:
                    target_handle = target_handle.split(".")[-1]

                # Ensure it has the correct prefix
                if not target_handle.startswith(f"{link.source_id}."):
                    link.target_handle = f"{link.source_id}.{target_handle}"

        return model

    model_config = {"from_attributes": True}


class WorkflowCreateRequestSchema(BaseModel):
    """A request to create a new workflow."""

    name: str
    description: str = ""
    definition: Optional[WorkflowDefinitionSchema] = None


class WorkflowResponseSchema(BaseModel):
    """A response containing the details of a workflow."""

    id: str
    name: str
    description: Optional[str]
    definition: WorkflowDefinitionSchema
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowVersionResponseSchema(BaseModel):
    """A response containing the details of a workflow version."""

    version: int
    name: str
    description: Optional[str]
    definition: Any
    definition_hash: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
