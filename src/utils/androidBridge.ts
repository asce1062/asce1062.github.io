import { androidBridgeService } from '../services/AndroidBridgeService';

// Make AndroidBridge globally available for testing and integration
if (typeof window !== 'undefined') {
  (window as any).androidBridge = androidBridgeService;
}

export { androidBridgeService };