import { Info, Database, Monitor, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function About() {
  const [health, setHealth] = useState(null);
  useEffect(() => { api.get('/health').then(({ data }) => setHealth(data)).catch(() => {}); }, []);

  return (
    <>
      <div className="page-head"><h2><Info size={20} /> About App</h2></div>
      <div className="grid-2">
        <div className="card card-pad">
          <div className="card-title"><Monitor size={15} /> School Management System</div>
          <p className="small">A complete school management solution covering admissions, students, classes, parents, attendance, exams & results, hall tickets, fees & finance, assets & inventory, communication, discipline, helpdesk and more — with role-based access for Admin, Clerk, Supervisor, Teacher, Student and Parent.</p>
          <table className="data-table mt">
            <tbody>
              <tr><td><b>Version</b></td><td>1.0.0</td></tr>
              <tr><td><b>Frontend</b></td><td>React (Vite), Chart.js</td></tr>
              <tr><td><b>Backend</b></td><td>Node.js + Express</td></tr>
              <tr><td><b>Database</b></td><td>{health ? (health.driver === 'file' ? 'File-based JSON store' : 'MongoDB Atlas') : '…'}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card card-pad">
          <div className="card-title"><Database size={15} /> Database Modes</div>
          <p className="small"><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> <b>Current driver:</b> {health?.driver === 'mongo' ? 'MongoDB (cloud.mongodb.com)' : 'File-based (zero setup)'}</p>
          <p className="small mt">To switch to MongoDB Atlas, edit <span className="mono">server/.env</span>:</p>
          <pre className="mono small" style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, marginTop: 8 }}>
{`DB_DRIVER=mongo
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGO_DB_NAME=school_management`}
          </pre>
          <p className="small mt">Then restart the server and run <span className="mono">npm run seed</span> once to populate demo data. Switch back anytime with <span className="mono">DB_DRIVER=file</span>.</p>
        </div>
      </div>
    </>
  );
}
