import { useState } from 'react';
import { MapPin, Phone, Mail, Globe, Clock, Send } from 'lucide-react';
import { useApp } from '../../context/AppContextValue';
import { Field } from '../../components/ui';

export default function Contact() {
  const { settings, notify } = useApp();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setSent(true);
    notify('Message sent! Our office will get back to you soon.');
  };

  const info = [
    { icon: MapPin, label: 'Address', value: settings.address || 'S.V.P. ROAD, Charni Road, Bhatwadi, PRARTHNA SAMAJ, Mumbai, Maharashtra 400004' },
    { icon: Phone, label: 'Phone', value: settings.phone || '022 2386 5845' },
    { icon: Mail, label: 'Email', value: settings.email || 'info@demoschool.edu' },
    { icon: Globe, label: 'Website', value: settings.website || 'www.demoschool.edu' },
    { icon: Clock, label: 'Office Hours', value: 'Mon – Sat, 8:00 AM – 4:00 PM' },
  ];

  return (
    <>
      <section className="hero" style={{ padding: '60px min(6vw, 70px)' }}>
        <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 40px)' }}>Contact Us</h1>
        <p>Questions about admissions, fees or anything else? We'd love to hear from you.</p>
      </section>

      <section className="public-section">
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            <div className="card-title">Get in Touch</div>
            {info.map((i) => (
              <div key={i.label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="fi" style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i.icon size={17} />
                </div>
                <div>
                  <div className="small muted" style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>{i.label}</div>
                  <b>{i.value}</b>
                </div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="card-title">Send a Message</div>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '40px 10px' }}>
                <Send size={40} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: '14px 0 6px' }}>Thank you, {form.name || 'friend'}!</h3>
                <p className="muted">Your message has been received. The school office will reply to <b>{form.email || 'your email'}</b> shortly.</p>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: 'grid', gap: 13 }}>
                <div className="form-grid">
                  <Field label="Your Name" required><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  <Field label="Email" required><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                </div>
                <Field label="Subject"><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Admission enquiry for Class 1" /></Field>
                <Field label="Message" required><textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                <button className="btn btn-green" style={{ justifyContent: 'center', padding: 11 }}><Send size={15} /> Send Message</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
