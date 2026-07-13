import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface LogContext {
  userId: string;
  userName: string;
  storeId: string;
  isOffline?: boolean;
}

let currentContext: LogContext = {
  userId: 'unknown_user',
  userName: 'Khách vãng lai / Hệ thống',
  storeId: 'Sandbox',
  isOffline: true,
};

export function setLogContext(context: LogContext) {
  currentContext = context;
}

export async function logOperation(screenName: string, action: string, data: any) {
  try {
    const timestamp = new Date().toISOString();
    const { userId, userName, storeId, isOffline } = currentContext;

    // Convert data to a secure object format for Firestore
    const dataObj = data && typeof data === 'object' ? data : { rawData: data };

    const logData = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: timestamp,
      timestamp,
      userId,
      userName,
      storeId: storeId || 'Sandbox',
      screenName,
      action,
      data: dataObj,
    };

    console.log('[LOG OPERATION]:', screenName, '-', action, logData);

    // Only write to Firestore if we are online and have a valid storeId
    if (!isOffline && storeId && storeId !== 'Sandbox') {
      const logsRef = collection(db, 'stores', storeId, 'logs');
      await addDoc(logsRef, logData);
      console.log('Logged operation successfully to Firestore:', logData);
    }
  } catch (error) {
    console.error('Failed to log operation:', error);
  }
}
