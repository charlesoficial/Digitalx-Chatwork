import { useRegisterSW } from "virtual:pwa-register/react";
export default function PwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return needRefresh ? (
    <div className="update-banner" role="status">
      <span>Uma nova versão do DIGITALX está pronta.</span>
      <button onClick={() => void updateServiceWorker(true)}>Atualizar</button>
      <button onClick={() => setNeedRefresh(false)}>Depois</button>
    </div>
  ) : null;
}
