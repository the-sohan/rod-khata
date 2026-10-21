import GoogleDriveSettings from '../components/google-drive-settings';
import {isHostedDemo} from '../../../../lib/demo-mode.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Google Drive সংযোগ · রডখাতা'};
export default function DrivePage() {
  if(isHostedDemo()) return <main className="main"><a href="/">ডেমোতে ফিরুন</a><h1>এটি শুধু নমুনা ডেমো</h1><p>এখানে ব্যক্তিগত Google account যুক্ত করা যায় না।</p></main>;
  return <main style={{maxWidth:980,margin:'40px auto',padding:'0 20px'}}><a className="button secondary" href="/" style={{marginBottom:20}}>PC অ্যাপে ফিরুন</a><GoogleDriveSettings/></main>;
}
