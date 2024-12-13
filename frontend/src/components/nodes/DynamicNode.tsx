import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Handle, useHandleConnections, NodeProps, useConnection } from '@xyflow/react';
import { useSelector, useDispatch } from 'react-redux';
import BaseNode from './BaseNode';
import styles from './DynamicNode.module.css';
import { Input } from '@nextui-org/react';
import {
  updateNodeData,
  updateEdgesOnHandleRename,
  nodesChange,
} from '../../store/flowSlice';
import { selectPropertyMetadata } from '../../store/nodeTypesSlice';
import { RootState } from '../../store/store';
import NodeOutputDisplay from './NodeOutputDisplay';

interface NodeData {
  config?: {
    input_schema?: Record<string, any>;
    output_schema?: Record<string, any>;
    system_message?: string;
    user_message?: string;
  };
  title?: string;
  [key: string]: any;
}

interface SchemaMetadata {
  required?: boolean;
  title?: string;
  type?: string;
  [key: string]: any;
}

const updateMessageVariables = (message: string | undefined, oldKey: string, newKey: string): string | undefined => {
  if (!message) return message;

  const regex = new RegExp(`{{\\s*${oldKey}\\s*}}`, 'g');
  return message.replace(regex, `{{${newKey}}}`);
};

interface DynamicNodeProps extends NodeProps {
  id: string;
  type: string;
  data: NodeData;
  position: { x: number; y: number };
  selected?: boolean;
  parentNode?: string;
  displayOutput?: boolean;
}

const DynamicNode: React.FC<DynamicNodeProps> = ({ id, type, data, position, displayOutput, ...props }) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [nodeWidth, setNodeWidth] = useState<string>('auto');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const node = useSelector((state: RootState) => state.flow.nodes.find((n) => n.id === id));
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const nodeData = data || (node && node.data);
  const dispatch = useDispatch();

  const edges = useSelector((state: RootState) => state.flow.edges);

  const inputMetadata = useSelector((state: RootState) => selectPropertyMetadata(state, `${type}.input`));
  const outputMetadata = useSelector((state: RootState) => selectPropertyMetadata(state, `${type}.output`));

  const excludeSchemaKeywords = (metadata: SchemaMetadata): Record<string, any> => {
    const schemaKeywords = ['required', 'title', 'type'];
    return Object.keys(metadata).reduce((acc: Record<string, any>, key) => {
      if (!schemaKeywords.includes(key)) {
        acc[key] = metadata[key];
      }
      return acc;
    }, {});
  };

  const cleanedInputMetadata = excludeSchemaKeywords(inputMetadata || {});
  const cleanedOutputMetadata = excludeSchemaKeywords(outputMetadata || {});

  const handleSchemaKeyEdit = useCallback(
    (oldKey: string, newKey: string, schemaType: 'input_schema' | 'output_schema') => {
      newKey = newKey.replace(/\s+/g, '_');
      if (oldKey === newKey || !newKey.trim()) {
        setEditingField(null);
        return;
      }

      const currentSchema = nodeData?.config?.[schemaType] || {};
      // Convert to array of entries to preserve order
      const schemaEntries = Object.entries(currentSchema);
      // Find the index of the old key
      const keyIndex = schemaEntries.findIndex(([key]) => key === oldKey);
      if (keyIndex !== -1) {
        // Replace the old key with new key while maintaining the value and position
        schemaEntries[keyIndex] = [newKey, currentSchema[oldKey]];
      }
      // Reconstruct the object maintaining order
      const updatedSchema = Object.fromEntries(schemaEntries);

      let updatedConfig = {
        ...nodeData?.config,
        [schemaType]: updatedSchema,
      };

      if (schemaType === 'input_schema') {
        if (nodeData?.config?.system_message) {
          updatedConfig.system_message = updateMessageVariables(
            nodeData.config.system_message,
            oldKey,
            newKey
          );
        }
        if (nodeData?.config?.user_message) {
          updatedConfig.user_message = updateMessageVariables(
            nodeData.config.user_message,
            oldKey,
            newKey
          );
        }
      }

      dispatch(
        updateNodeData({
          id,
          data: {
            config: updatedConfig,
          },
        })
      );

      dispatch(
        updateEdgesOnHandleRename({
          nodeId: id,
          oldHandleId: oldKey,
          newHandleId: newKey,
          schemaType,
        })
      );

      setEditingField(null);
    },
    [dispatch, id, nodeData]
  );

  useEffect(() => {
    if (!nodeRef.current || !nodeData) return;

    const outputSchema = nodeData?.config?.['output_schema'] || cleanedOutputMetadata || {};

    const inputLabels = predecessorNodes.map((node) => node?.data?.config?.title || node?.id);
    const outputLabels = nodeData?.config?.title ? [nodeData.config.title] : [id];

    const maxInputLabelLength = inputLabels.reduce((max, label) => Math.max(max, label.length), 0);
    const maxOutputLabelLength = outputLabels.reduce((max, label) => Math.max(max, label.length), 0);
    const titleLength = ((nodeData?.title || '').length + 10) * 1.25;

    const maxLabelLength = Math.max(
      (maxInputLabelLength + maxOutputLabelLength + 5),
      titleLength
    );

    const minNodeWidth = 300;
    const maxNodeWidth = 600;

    const finalWidth = Math.min(
      Math.max(maxLabelLength * 10, minNodeWidth),
      maxNodeWidth
    );
    if (finalWidth !== parseInt(nodeWidth)){
      setNodeWidth(`${finalWidth}px`);
    }
  }, [nodeData, cleanedInputMetadata, cleanedOutputMetadata]);

  interface HandleRowProps {
    keyName: string;
  }

  const InputHandleRow: React.FC<HandleRowProps> = ({ keyName }) => {
    const connections = useHandleConnections({ type: 'target', id: keyName });

    return (
      <div className={`${styles.handleRow} w-full justify-end`} key={keyName} id={`input-${keyName}-row`}>
        <div className={`${styles.handleCell} ${styles.inputHandleCell}`} id={`input-${keyName}-handle`}>
          <Handle
            type="target"
            position="left"
            id={keyName}
            className={`${styles.handle} ${styles.handleLeft} ${isCollapsed ? styles.collapsedHandleInput : ''
              }`}
            isConnectable={!isCollapsed && connections.length === 0}
          />
        </div>
        <div className="border-r border-gray-300 h-full mx-0"></div>
        {!isCollapsed && (
          <div className="align-center flex flex-grow flex-shrink ml-[0.5rem] max-w-full overflow-hidden" id={`input-${keyName}-label`}>
            {editingField === keyName ? (
              <Input
                autoFocus
                defaultValue={keyName}
                size="sm"
                variant="faded"
                radius="lg"
                classNames={{
                  input: 'bg-default-100',
                  inputWrapper: 'shadow-none',
                }}
              />
            ) : (
              <span
                className={`${styles.handleLabel} text-sm font-medium cursor-pointer hover:text-primary mr-auto overflow-hidden text-ellipsis whitespace-nowrap`}
              >
                {keyName}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const OutputHandleRow: React.FC<HandleRowProps> = ({ keyName }) => {
    return (
      <div className={`${styles.handleRow} w-full justify-end`} key={`output-${keyName}`} id={`output-${keyName}-row`} >
        {!isCollapsed && (
          <div className="align-center flex flex-grow flex-shrink mr-[0.5rem] max-w-full overflow-hidden" id={`output-${keyName}-label`}>
            {editingField === keyName ? (
              <Input
                autoFocus
                defaultValue={keyName}
                size="sm"
                variant="faded"
                radius="lg"
                classNames={{
                  input: 'bg-default-100',
                  inputWrapper: 'shadow-none',
                }}
              />
            ) : (
              <span
                className={`${styles.handleLabel} text-sm font-medium cursor-pointer hover:text-primary ml-auto overflow-hidden text-ellipsis whitespace-nowrap`}
              >
                {keyName}
              </span>
            )}
          </div>
        )}
        <div className="border-l border-gray-300 h-full mx-0"></div>
        <div className={`${styles.handleCell} ${styles.outputHandleCell}`} id={`output-${keyName}-handle`}>
          <Handle
            type="source"
            position="right"
            id={keyName}
            className={`${styles.handle} ${styles.handleRight} ${isCollapsed ? styles.collapsedHandleOutput : ''
              }`}
            isConnectable={!isCollapsed}
          />
        </div>
      </div>
    );
  };

  const [predecessorNodes, setPredcessorNodes] = useState(edges.filter((edge) => edge.target === id).map((edge) => {
    return nodes.find((node) => node.id === edge.source);
  }));

  const renderHandles = () => {
    if (!nodeData) return null;

    return (
      <div className={`${styles.handlesWrapper}`} id="handles">
        {/* Input Handles */}
        <div className={`${styles.handlesColumn} ${styles.inputHandlesColumn}`} id="input-handles">
          {predecessorNodes.map((node) => (
            <InputHandleRow key={node?.data?.config?.title || node?.id} keyName={node?.data?.config?.title || node?.id} />
          ))}
        </div>

        {/* Output Handles */}
        <div className={`${styles.handlesColumn} ${styles.outputHandlesColumn}`} id="output-handle">
          {nodeData?.title && <OutputHandleRow keyName={nodeData.config.title ? nodeData.config.title : id} />}
        </div>
      </div>
    );
  };

  const connection = useConnection();

  useEffect(() => {
    // If a connection is in progress and the target node is this node
    // temporarily show a handle for the source node as the connection is being made
    if (connection.inProgress && connection.toNode && connection.toNode.id === id) {
      let predecessorNodes = edges
        .filter((edge) => edge.target === id)
        .map((edge) => nodes.find((node) => node.id === edge.source));

      // Check if the source node is not already included
      if (!predecessorNodes.find((node) => node?.id === connection.fromNode.id)) {
        const fromNode = nodes.find((node) => node.id === connection.fromNode.id);
        if (fromNode) {
          predecessorNodes = predecessorNodes.concat(fromNode);
        }
      }

      setPredcessorNodes(predecessorNodes);
    } else {
      // Update predecessor nodes when no connection is in progress
      const updatedPredecessorNodes = edges
        .filter((edge) => edge.target === id)
        .map((edge) => nodes.find((node) => node.id === edge.source));

      setPredcessorNodes(updatedPredecessorNodes);
    }
  }, [connection, nodes, edges, id]);

  const isIfElseNode = type === 'IfElseNode';

  return (
    <div
      className={styles.dynamicNodeWrapper}
      style={{ zIndex: props.parentNode ? 1 : 0 }}
    >
      <BaseNode
        id={id}
        data={nodeData}
        style={{
          width: nodeWidth,
        }}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        selected={props.selected}
        className="hover:!bg-background"
      >
        <div className={styles.nodeWrapper} ref={nodeRef} id={`node-${id}-wrapper`}>
          {isIfElseNode ? (
            <div>
              <strong>Conditional Node</strong>
            </div>
          ) : null}
          {renderHandles()}
        </div>
        {displayOutput && <NodeOutputDisplay node={node} />}
      </BaseNode>
    </div>
  );
};

export default DynamicNode;