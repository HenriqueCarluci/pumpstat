// Teste do app Android na Play Store: a pessoa entra na lista pelo app e o admin passa os e-mails para o Play Console.
import { rpc } from './api.js';

export const androidTestStatus = () => rpc('android_tester_status');
export const androidTestJoin = (email) => rpc('android_tester_join', { p_email: email });
export const androidTestLeave = () => rpc('android_tester_leave');
export const adminAndroidTesters = () => rpc('admin_android_testers');
export const adminAndroidTestersMark = (users, added) => rpc('admin_android_testers_mark', { p_users: users, p_added: added });
export const adminNotifyAndroidTesters = (version) => rpc('admin_notify_android_testers', { p_version: version });
export const adminAndroidTestersNotify = (users, on) => rpc('admin_android_testers_notify', { p_users: users, p_on: on });
export const adminAndroidCandidates = (q) => rpc('admin_android_candidates', { p_q: q || '' });
export const adminAndroidTestersAdd = (users) => rpc('admin_android_testers_add', { p_users: users });
