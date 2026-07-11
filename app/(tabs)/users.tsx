import { useQuery } from '@tanstack/react-query';
import { ScrollText, Terminal } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLogs } from '@/src/services/lucky';

export default function LogsScreen() {
  const colors = useAppTheme();
  const query = useQuery({ queryKey: ['lucky', 'logs'], queryFn: () => getLogs() });
  return <Page title="运行日志" subtitle="Lucky 全局日志" icon={ScrollText} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {query.data?.length ? <Panel><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 3 }}><Terminal color={colors.success} size={17} /><Text style={{ flex: 1, color: colors.text, fontWeight: '700' }}>实时输出</Text><Text style={{ color: colors.subtext, fontSize: 11 }}>{query.data.length} 条</Text></View>{query.data.slice(-300).reverse().map((line, index) => <Text selectable key={`${index}-${line.slice(0, 20)}`} style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18, paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.rowBorder }}>{line}</Text>)}</Panel> : !query.isLoading && !query.error ? <EmptyState message="暂无日志" icon={Terminal} /> : null}
  </Page>;
}
