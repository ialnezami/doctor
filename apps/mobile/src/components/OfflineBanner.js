import { View, Text } from 'react-native';

export default function OfflineBanner({ isOnline, pendingCount }) {
  if (isOnline) return null;
  return (
    <View style={{ backgroundColor: '#F59E0B', paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center' }}>
      <Text style={{ color: '#000', fontSize: 12, fontWeight: '600' }}>
        {'Offline'}
        {pendingCount > 0
          ? ` — ${pendingCount} operation${pendingCount !== 1 ? 's' : ''} pending sync`
          : ' — changes will sync when connected'}
      </Text>
    </View>
  );
}
