import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Eye, EyeOff, LogIn, Server } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { baseUrl: luckySessionState.baseUrl || 'http://', account: luckySessionState.account, password: luckySessionState.password } });
  const fieldStyle = { backgroundColor: colors.mutedCard, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 13, color: colors.text, fontSize: 15 } as const;

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
    <View style={{ maxWidth: 460, width: '100%', alignSelf: 'center', gap: 22 }}>
      <View style={{ gap: 10 }}><View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Server color="#fff" size={27} /></View><Text style={{ color: colors.text, fontSize: 30, fontWeight: '800' }}>Lucky 管理</Text><Text style={{ color: colors.subtext, lineHeight: 21 }}>连接你的 Lucky 2.27.2 服务。凭据仅保存在当前设备的安全存储中。</Text></View>
      <View style={{ gap: 14, padding: 18, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        {([['baseUrl', '服务地址', 'http://192.168.1.2:16601'], ['account', '管理员账号', 'admin']] as const).map(([name, label, placeholder]) => <View key={name} style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text><Controller name={name} control={control} render={({ field }) => <TextInput {...field} onChangeText={field.onChange} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} autoComplete={name === 'account' ? 'username' : 'off'} textContentType={name === 'account' ? 'username' : 'URL'} keyboardType={name === 'baseUrl' ? 'url' : 'default'} style={fieldStyle} />} />{errors[name] ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors[name]?.message}</Text> : null}</View>)}
        <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>密码</Text><View><Controller name="password" control={control} render={({ field }) => <TextInput {...field} onChangeText={field.onChange} placeholder="输入密码" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" secureTextEntry={!showPassword} style={[fieldStyle, { paddingRight: 50 }]} />} /><Pressable accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 5, top: 4, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>{showPassword ? <EyeOff color={colors.subtext} size={19} /> : <Eye color={colors.subtext} size={19} />}</Pressable></View>{errors.password ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.password.message}</Text> : null}</View>
        {error ? <Text style={{ color: colors.danger, backgroundColor: colors.dangerBg, padding: 11, borderRadius: 8 }}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={isSubmitting} style={{ backgroundColor: isSubmitting ? colors.disabled : colors.primary, borderRadius: 8, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>{isSubmitting ? <ActivityIndicator color="#fff" /> : <LogIn color="#fff" size={19} />}<Text style={{ color: '#fff', fontWeight: '700' }}>{isSubmitting ? '正在登录' : '登录'}</Text></Pressable>
      </View>
    </View>
  </ScrollView></SafeAreaView>;
}
