import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { ScrollText, Terminal } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Platform, Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, SectionHeader } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getGlobalLogBatch } from '@/src/services/lucky';

const MAX_LOG_LINES = 5000;
type LogLine = { id: number; text: string };

export default function LogsScreen() {
  const colors = useAppTheme();
  const cursorRef = useRef('');
  const startTimeRef = useRef('');
  const nextLineIdRef = useRef(0);
  const [lines, setLines] = useState<LogLine[]>([]);
  const isFocused = useIsFocused();
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const logsActive = isFocused && appIsActive;
  const query = useQuery({
    queryKey: ['lucky', 'logs'],
    queryFn: ({ signal }) => getGlobalLogBatch(cursorRef.current, signal),
    enabled: logsActive,
    refetchInterval: logsActive ? 3000 : false,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const batch = query.data;
    if (!batch) return;
    const restarted = batch.reset || Boolean(batch.startTime && startTimeRef.current && batch.startTime !== startTimeRef.current);
    if (batch.cursor) cursorRef.current = batch.cursor;
    if (batch.startTime) startTimeRef.current = batch.startTime;
    setLines((current) => {
      if (batch.incremental && !restarted && !batch.lines.length) return current;
      if (!batch.incremental && !restarted && current.length === batch.lines.length
        && current.every((line, index) => line.text === batch.lines[index])) return current;
      const received = batch.lines.map((text) => ({ id: ++nextLineIdRef.current, text }));
      const next = batch.incremental && !restarted ? [...current, ...received] : received;
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, [query.data, query.dataUpdatedAt]);
  const newestFirst = useMemo(() => [...lines].reverse(), [lines]);
  return <Page title="运行日志" subtitle="Lucky 全局日志" icon={ScrollText} scrollable={false} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {lines.length ? <View style={{ flex: 1, minHeight: 0 }}><SectionHeader icon={Terminal} title="实时输出" meta={`${lines.length} 条`} /><FlatList
      data={newestFirst}
      keyExtractor={(line) => String(line.id)}
      removeClippedSubviews={Platform.OS === 'android'}
      initialNumToRender={40}
      maxToRenderPerBatch={40}
      windowSize={9}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ paddingBottom: 98 }}
      renderItem={({ item: line, index }) => <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18, paddingVertical: 5, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}>{line.text}</Text>}
    /></View> : !query.isLoading && !query.error ? <EmptyState message="暂无日志" icon={Terminal} /> : null}
  </Page>;
}
