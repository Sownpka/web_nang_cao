import { Toaster } from 'sonner';
import { useIsDark } from '@/hooks/useIsDark';

export function AppToaster() {
  const dark = useIsDark();
  return <Toaster theme={dark ? 'dark' : 'light'} richColors position="top-right" closeButton />;
}
