import { useConnection } from '../hooks/useConnection';
import { useNotifications } from '../hooks/useNotifications';
import { ErrorMessage } from './ErrorMessage';

export function ConnectionBanner() {
  const connected = useConnection();
  if (connected) {
    return null;
  }
  return <ErrorMessage tone="warning" message="Sem conexão. As mensagens serão sincronizadas quando a conexão voltar." />;
}

export function NotificationBanner() {
  const { status, retryRegistration } = useNotifications();
  switch (status.state) {
    case 'permission-denied':
      return (
        <ErrorMessage
          tone="warning"
          message="Notificações desativadas. Permita nas configurações para receber avisos."
          actionLabel="Tentar"
          onAction={retryRegistration}
        />
      );
    case 'unavailable':
      return (
        <ErrorMessage tone="warning" message={status.reason} actionLabel="Tentar" onAction={retryRegistration} />
      );
    case 'error':
      return <ErrorMessage tone="warning" message={status.message} actionLabel="Tentar" onAction={retryRegistration} />;
    default:
      return null;
  }
}
