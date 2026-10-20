import React, { useState, useEffect } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { taskManager, TaskStatus } from '../services/backgroundTaskManager';
import { theme } from '../constants/theme';

/**
 * Background Task Monitor Component
 * Displays ongoing and completed background tasks with progress indicators
 */
export default function BackgroundTaskMonitor({ visible = false, onClose }) {
    const [tasks, setTasks] = useState([]);
    const [expandedTaskId, setExpandedTaskId] = useState(null);

    useEffect(() => {
        // Update tasks list
        const updateTasks = () => {
            setTasks(taskManager.getAllTasks());
        };

        // Listen for task updates
        const unsubscribe = taskManager.onTaskUpdate(() => {
            updateTasks();
        });

        // Initial load
        updateTasks();

        return unsubscribe;
    }, []);

    if (!visible) return null;

    const activeTasks = tasks.filter(t => [TaskStatus.PENDING, TaskStatus.RUNNING].includes(t.status));
    const completedTasks = tasks.filter(t => [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(t.status));

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Background Tasks</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Active Tasks */}
                {activeTasks.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Running</Text>
                        {activeTasks.map(task => (
                            <TaskCard key={task.id} task={task} isExpanded={expandedTaskId === task.id} onToggle={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} />
                        ))}
                    </>
                )}

                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Completed</Text>
                        {completedTasks.map(task => (
                            <TaskCard key={task.id} task={task} isExpanded={expandedTaskId === task.id} onToggle={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} />
                        ))}
                    </>
                )}

                {tasks.length === 0 && (
                    <Text style={styles.emptyText}>No background tasks yet</Text>
                )}
            </ScrollView>

            {completedTasks.length > 0 && (
                <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => {
                        taskManager.clearHistory();
                        setTasks([]);
                    }}
                >
                    <Text style={styles.clearBtnText}>Clear History</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

/**
 * Individual Task Card Component
 */
function TaskCard({ task, isExpanded, onToggle }) {
    const getStatusColor = (status) => {
        switch (status) {
            case TaskStatus.PENDING:
            case TaskStatus.RUNNING:
                return theme.colors.primary;
            case TaskStatus.COMPLETED:
                return theme.colors.success || '#4CAF50';
            case TaskStatus.FAILED:
                return '#F44336';
            case TaskStatus.CANCELLED:
                return '#9E9E9E';
            default:
                return theme.colors.primary;
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case TaskStatus.PENDING:
                return '⏳';
            case TaskStatus.RUNNING:
                return '⚙️';
            case TaskStatus.COMPLETED:
                return '✓';
            case TaskStatus.FAILED:
                return '✕';
            case TaskStatus.CANCELLED:
                return '⊘';
            default:
                return '?';
        }
    };

    const statusColor = getStatusColor(task.status);
    const isActive = [TaskStatus.PENDING, TaskStatus.RUNNING].includes(task.status);

    return (
        <TouchableOpacity
            style={[styles.card, { borderLeftColor: statusColor }]}
            onPress={onToggle}
        >
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.taskName}>{task.metadata.name}</Text>
                    <Text style={styles.taskMeta}>
                        {getStatusIcon(task.status)} {task.status.toUpperCase()}
                    </Text>
                </View>
                <Text style={[styles.statusIcon, { color: statusColor }]}>
                    {getStatusIcon(task.status)}
                </Text>
            </View>

            {task.metadata.description && !isExpanded && (
                <Text style={styles.taskDescription} numberOfLines={1}>
                    {task.metadata.description}
                </Text>
            )}

            {/* Progress Bar */}
            {isActive && (
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${task.progress}%`, backgroundColor: statusColor }]} />
                </View>
            )}

            {/* Expanded Details */}
            {isExpanded && (
                <View style={styles.expandedDetails}>
                    {task.metadata.description && (
                        <>
                            <Text style={styles.detailLabel}>Description</Text>
                            <Text style={styles.detailValue}>{task.metadata.description}</Text>
                        </>
                    )}

                    <Text style={styles.detailLabel}>Task ID</Text>
                    <Text style={[styles.detailValue, { fontSize: 11, fontFamily: 'monospace' }]}>
                        {task.id.substring(0, 20)}...
                    </Text>

                    <Text style={styles.detailLabel}>Created</Text>
                    <Text style={styles.detailValue}>
                        {new Date(task.metadata.createdAt).toLocaleString()}
                    </Text>

                    {task.startedAt && (
                        <>
                            <Text style={styles.detailLabel}>Started</Text>
                            <Text style={styles.detailValue}>
                                {new Date(task.startedAt).toLocaleTimeString()}
                            </Text>
                        </>
                    )}

                    {task.completedAt && (
                        <>
                            <Text style={styles.detailLabel}>Completed</Text>
                            <Text style={styles.detailValue}>
                                {new Date(task.completedAt).toLocaleTimeString()}
                            </Text>
                        </>
                    )}

                    {task.error && (
                        <>
                            <Text style={styles.detailLabel}>Error</Text>
                            <Text style={[styles.detailValue, { color: '#F44336' }]}>
                                {task.error.message}
                            </Text>
                        </>
                    )}

                    {task.result && (
                        <>
                            <Text style={styles.detailLabel}>Result</Text>
                            <Text style={styles.detailValue}>
                                {typeof task.result === 'object'
                                    ? JSON.stringify(task.result, null, 2)
                                    : String(task.result)}
                            </Text>
                        </>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        max: 400,
        backgroundColor: '#fff',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        maxHeight: '70%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: Platform.OS === 'android' ? 0 : 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#212121',
    },
    closeBtn: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtnText: {
        fontSize: 20,
        color: '#757575',
    },
    content: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#757575',
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 4,
    },
    card: {
        backgroundColor: '#fafafa',
        borderLeftWidth: 4,
        borderRadius: 8,
        padding: 12,
        marginVertical: 6,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    taskName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#212121',
    },
    taskMeta: {
        fontSize: 12,
        color: '#757575',
        marginTop: 2,
    },
    taskDescription: {
        fontSize: 12,
        color: '#9E9E9E',
        marginTop: 4,
    },
    statusIcon: {
        fontSize: 20,
        marginLeft: 8,
    },
    progressContainer: {
        height: 4,
        backgroundColor: '#E0E0E0',
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 2,
    },
    expandedDetails: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
    },
    detailLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#757575',
        marginTop: 8,
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 12,
        color: '#212121',
    },
    emptyText: {
        textAlign: 'center',
        color: '#9E9E9E',
        fontSize: 14,
        marginTop: 20,
    },
    clearBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        alignItems: 'center',
    },
    clearBtnText: {
        color: '#757575',
        fontSize: 13,
        fontWeight: '600',
    },
});
