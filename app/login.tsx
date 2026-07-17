import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Eye, EyeOff, Link2, LockKeyhole, LogIn, Server, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { loginToLucky } from '@/src/services/lucky';
import { luckySessionState, saveLuckySession } from '@/src/store/lucky-session';

const schema = z.object({
  baseUrl: z.string().url('请输入完整地址，例如 http://192.168.1.2:16601'),
  account: z.string().min(1, '请输入管理员账号'),
  password: z.string().min(1, '请输入密码'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const colors = useAppTheme();
  const viewport = useWindowDimensions();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { baseUrl: luckySessionState.baseUrl || 'http://', account: luckySessionState.account, password: luckySessionState.password } });
  const fieldStyle = { minHeight: 50, backgroundColor: colors.mutedCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingLeft: 44, paddingRight: 13, paddingVertical: 12, color: colors.text, fontSize: 16 } as const;

  const submit = handleSubmit(async (values) => {
    setError('');
    try {
      const token = await loginToLucky(values);
      await saveLuckySession({ baseUrl: values.baseUrl, account: values.account, password: values.password, token });
      queryClient.clear();
      router.replace('/monitor');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '登录失败'); }
  });

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 22 }}>
    <View style={{ width: Math.min(440, Math.max(0, viewport.width - 44)), alignSelf: 'center', gap: 24 }}>
      <View style={{ gap: 8, alignItems: 'center' }}><View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: Platform.OS === 'ios' ? 0.2 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 }}><Server color="#fff" size={31} strokeWidth={2.1} /></View><Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 5 }}>Lucky</Text><Text style={{ color: colors.subtext, fontSize: 15 }}>管理控制台</Text></View>
      <View style={{ gap: 16, padding: 20, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: Platform.OS === 'ios' || Platform.OS === 'web' ? 0.05 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === 'android' ? 1 : 0 }}>
        {([['baseUrl', '服务地址', 'http://192.168.1.2:16601', Link2], ['account', '管理员账号', 'admin', UserRound]] as const).map(([name, label, placeholder, Icon]) => <View key={name} style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text><View><Icon color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} /><Controller name={name} control={control} render={({ field }) => <TextInput {...field} onChangeText={field.onChange} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} autoComplete={name === 'account' ? 'username' : 'off'} textContentType={name === 'account' ? 'username' : 'URL'} keyboardType={name === 'baseUrl' ? 'url' : 'default'} style={fieldStyle} />} /></View>{errors[name] ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors[name]?.message}</Text> : null}</View>)}
        <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>密码</Text><View><LockKeyhole color={colors.subtext} size={18} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} /><Controller name="password" control={control} render={({ field }) => <TextInput {...field} onChangeText={field.onChange} placeholder="输入密码" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" secureTextEntry={!showPassword} style={[fieldStyle, { paddingRight: 50 }]} />} /><Pressable accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 5, top: 4, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>{showPassword ? <EyeOff color={colors.subtext} size={19} /> : <Eye color={colors.subtext} size={19} />}</Pressable></View>{errors.password ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.password.message}</Text> : null}</View>
        {error ? <Text style={{ color: colors.danger, backgroundColor: colors.dangerBg, padding: 12, borderRadius: 12 }}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={isSubmitting} style={({ pressed }) => ({ backgroundColor: isSubmitting ? colors.disabled : colors.primary, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.72 : 1 })}>{isSubmitting ? <ActivityIndicator color="#fff" /> : <LogIn color="#fff" size={19} />}<Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{isSubmitting ? '正在登录' : '登录'}</Text></Pressable>
      </View>
    </View>
  </ScrollView></SafeAreaView>;
}
