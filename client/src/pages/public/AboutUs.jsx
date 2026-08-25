import { Target, Eye, HeartHandshake, Award, Users, BookOpen } from 'lucide-react';
import { useApp } from '../../context/AppContextValue';

export default function AboutUs() {
  const { settings } = useApp();

  return (
    <>
      <section className="hero" style={{ padding: '60px min(6vw, 70px)' }}>
        <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 40px)' }}>About {settings.schoolName || 'Demo School'}</h1>
        <p>{settings.tagline || 'Learn. Grow. Succeed.'}</p>
      </section>

      <section className="public-section">
        <div className="feat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="feat-card">
            <div className="fi"><Target size={22} /></div>
            <h3>Our Mission</h3>
            <p>To provide quality education that nurtures curiosity, builds character and prepares every child for a rapidly changing world — supported by transparent, technology-driven administration.</p>
          </div>
          <div className="feat-card">
            <div className="fi"><Eye size={22} /></div>
            <h3>Our Vision</h3>
            <p>A school where every student is known, every parent is informed, and every teacher is empowered — with information flowing seamlessly between classroom, office and home.</p>
          </div>
          <div className="feat-card">
            <div className="fi"><HeartHandshake size={22} /></div>
            <h3>Our Values</h3>
            <p>Integrity, inclusiveness and innovation. We believe strong school-parent partnerships and open communication create the best environment for learning.</p>
          </div>
        </div>
      </section>

      <section className="public-section" style={{ paddingTop: 0 }}>
        <h2>Why Families Choose Us</h2>
        <p className="lead">A snapshot of what makes our community special.</p>
        <div className="feat-grid">
          <div className="feat-card">
            <div className="fi"><Users size={22} /></div>
            <h3>Small Class Sizes</h3>
            <p>Capacity-managed classes ensure every student gets personal attention from teachers who know them by name.</p>
          </div>
          <div className="feat-card">
            <div className="fi"><BookOpen size={22} /></div>
            <h3>Rich Curriculum</h3>
            <p>IB PYP-inspired learning with strong foundations in mathematics, sciences, languages and the arts, plus sports and cultural activities.</p>
          </div>
          <div className="feat-card">
            <div className="fi"><Award size={22} /></div>
            <h3>Transparent Progress</h3>
            <p>Parents track attendance, published results and fees in real time through their own portal — no surprises at the end of term.</p>
          </div>
        </div>
      </section>
    </>
  );
}
