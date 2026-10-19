import GoogleDriveSettings from '../components/google-drive-settings';
export const metadata={title:'Google Drive সংযোগ · রডখাতা'};
export default function DrivePage() {
  return <main style={{maxWidth:980,margin:'40px auto',padding:'0 20px'}}><a className="button secondary" href="/" style={{marginBottom:20}}>PC অ্যাপে ফিরুন</a><GoogleDriveSettings/></main>;
}
