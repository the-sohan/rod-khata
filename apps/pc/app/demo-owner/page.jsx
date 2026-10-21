import {notFound} from 'next/navigation';
import {isHostedDemo} from '../../../../lib/demo-mode.mjs';
import OwnerDashboard from '../../../owner/app/page';
export const dynamic='force-dynamic';
export const metadata={title:'মালিকের মোবাইল ডেমো · রডখাতা'};
export default function DemoOwnerPage() {
  if(!isHostedDemo()) notFound();
  return <OwnerDashboard webDemo/>;
}
