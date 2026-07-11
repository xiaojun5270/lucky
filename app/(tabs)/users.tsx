import { useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';

import { EmptyState, ErrorState, Page, Panel } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLogs } from '@/src/services/lucky';

export default function LogsScreen() {
  const colors = useAppTheme();
  const query = useQuery({ queryKey: ['lucky', 'logs'], queryFn: () => getLogs() });
  return <Page title="运行日志" subtitle="Lucky 全局日志" refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {query.data?.length ? <Panel>{query.data.slice(-300).reverse().map((line, index) => <Text selectable key={`${index}-${line.slice(0, 20)}`} style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18, paddingVertical: 4, borderBottomWidth: index < query.data.length - 1 ? 1 : 0, borderBottomColor: colors.rowBorder }}>{line}</Text>)}</Panel> : !query.isLoading && !query.error ? <EmptyState message="暂无日志" /> : null}
  </Page>;
}
