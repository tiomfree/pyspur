import {
    Button,
    Chip,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Textarea,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { formatDistanceToNow } from 'date-fns'
import React, { useEffect, useState } from 'react'

import { PausedWorkflowResponse } from '@/types/api_types/pausedWorkflowSchemas'

interface HumanInputModalProps {
    isOpen: boolean
    onClose: () => void
    workflow: PausedWorkflowResponse
    onSubmit: (action: 'APPROVE' | 'DECLINE' | 'OVERRIDE', inputData: Record<string, any>, comments: string) => void
}

const HumanInputModal: React.FC<HumanInputModalProps> = ({ isOpen, onClose, workflow, onSubmit }) => {
    const [action, setAction] = useState<'APPROVE' | 'DECLINE' | 'OVERRIDE'>('APPROVE')
    const [inputData, setInputData] = useState<Record<string, any>>({})
    const [comments, setComments] = useState('')

    // Initialize input data with existing input fields if available
    React.useEffect(() => {
        // Try to extract any existing input data from the paused workflow
        if (workflow?.current_pause?.input_data) {
            const existingData = workflow.current_pause.input_data
            setInputData(existingData)
        }
    }, [workflow])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                handleSubmit()
            } else if (event.key === 'Escape') {
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, action, inputData, comments])

    const handleSubmit = () => {
        onSubmit(action, inputData, comments)
        onClose()
    }

    const getInputSchema = () => {
        const workflowDef = 'definition' in workflow.workflow ? workflow.workflow.definition : workflow.workflow

        const node = workflowDef.nodes.find((n) => n.id === workflow.current_pause.node_id)
        return node?.config?.input_schema || {}
    }

    const renderInputField = (key: string, type: string) => {
        const value = inputData[key] || ''
        const handleChange = (newValue: any) => {
            setInputData((prev) => ({ ...prev, [key]: newValue }))
        }

        switch (type.toLowerCase()) {
            case 'string':
                return (
                    <Input
                        key={key}
                        label={key}
                        placeholder={`Enter ${key}`}
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                    />
                )
            case 'number':
                return (
                    <Input
                        key={key}
                        type="number"
                        label={key}
                        placeholder={`Enter ${key}`}
                        value={value}
                        onChange={(e) => handleChange(Number(e.target.value))}
                    />
                )
            case 'boolean':
                return (
                    <Select
                        key={key}
                        label={key}
                        placeholder={`Select ${key}`}
                        value={value}
                        onChange={(e) => handleChange(e.target.value === 'true')}
                    >
                        <SelectItem key="true" value="true">
                            True
                        </SelectItem>
                        <SelectItem key="false" value="false">
                            False
                        </SelectItem>
                    </Select>
                )
            default:
                return (
                    <Input
                        key={key}
                        label={key}
                        placeholder={`Enter ${key}`}
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                    />
                )
        }
    }

    return (
        <Modal size="3xl" isOpen={isOpen} onClose={onClose}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold">Human Input Required</h3>
                    <div className="flex items-center gap-2 text-sm text-default-500">
                        <Chip size="sm" color="warning">
                            Paused
                        </Chip>
                        <span>•</span>
                        <span>Workflow: {'name' in workflow.workflow ? workflow.workflow.name : 'Unnamed'}</span>
                        <span>•</span>
                        <span>Run ID: {workflow.run.id}</span>
                    </div>
                </ModalHeader>
                <ModalBody>
                    <div className="space-y-4">
                        {/* Pause Message */}
                        <div className="bg-default-100 p-4 rounded-lg">
                            <div className="flex items-start gap-3">
                                <Icon icon="lucide:alert-circle" className="w-5 h-5 text-warning mt-0.5" />
                                <div>
                                    <h4 className="font-medium">Message</h4>
                                    <p className="text-sm text-default-600">{workflow.current_pause.pause_message}</p>
                                    <p className="text-xs text-default-400 mt-1">
                                        Paused {formatDistanceToNow(new Date(workflow.current_pause.pause_time))} ago
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Action Selection */}
                        <div>
                            <h4 className="font-medium mb-2">Action</h4>
                            <div className="flex gap-2">
                                <Button
                                    color={action === 'APPROVE' ? 'success' : 'default'}
                                    variant={action === 'APPROVE' ? 'solid' : 'bordered'}
                                    onPress={() => setAction('APPROVE')}
                                >
                                    Approve
                                </Button>
                                <Button
                                    color={action === 'DECLINE' ? 'danger' : 'default'}
                                    variant={action === 'DECLINE' ? 'solid' : 'bordered'}
                                    onPress={() => setAction('DECLINE')}
                                >
                                    Decline
                                </Button>
                                <Button
                                    color={action === 'OVERRIDE' ? 'warning' : 'default'}
                                    variant={action === 'OVERRIDE' ? 'solid' : 'bordered'}
                                    onPress={() => setAction('OVERRIDE')}
                                >
                                    Override
                                </Button>
                            </div>
                        </div>

                        {/* Input Fields */}
                        {action !== 'DECLINE' && (
                            <div>
                                <h4 className="font-medium mb-2">Required Inputs</h4>
                                <div className="space-y-3">
                                    {Object.entries(getInputSchema()).map(([key, type]) =>
                                        renderInputField(key, type as string)
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Comments */}
                        <div>
                            <h4 className="font-medium mb-2">Comments</h4>
                            <Textarea
                                placeholder="Add any comments about your decision..."
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                            />
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button
                        size="lg"
                        variant="bordered"
                        onPress={onClose}
                        endContent={<span className="text-xs opacity-70">ESC</span>}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="lg"
                        color="primary"
                        onPress={handleSubmit}
                        endContent={<span className="text-xs opacity-70">⌘+↵</span>}
                    >
                        Submit Decision
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default HumanInputModal
