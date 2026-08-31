import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Users, CheckCircle2, AlertCircle, ArrowRight, Loader2, RefreshCw, Wallet, GraduationCap, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { Badge, Confirm, DataTable, Field, FilterBar, KpiCard } from '../components/ui';
import { formatClass, isPrePrimaryClassName } from '../utils/classNames';

export default function Promotions() {
  const { notify, settings } = useApp();
  const { classes = [] } = useLookups(['classes']);
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [targetFeeCategory, setTargetFeeCategory] = useState('EXISTING');
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const notifyRef = useRef(notify);
  const cur = settings.currency || '₹';

  useEffect(() => { notifyRef.current = notify; }, [notify]);

  const fetchCandidates = useCallback(async () => {
    if (!sourceClassId) return;
    setLoadingCandidates(true);
    try {
      const { data } = await api.get(`/promotions/preview/${sourceClassId}`);
      setCandidates((data.candidates || []).map((candidate) => ({
        ...candidate,
        action: 'PROMOTE',
      })));
    } catch (error) {
      notifyRef.current(errMsg(error), 'error');
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, [sourceClassId]);

  useEffect(() => {
    if (!sourceClassId) {
      setCandidates([]);
      return;
    }
    fetchCandidates();
  }, [sourceClassId, fetchCandidates]);

  const updateCandidate = useCallback((studentId, changes) => {
    setCandidates((current) => current.map((candidate) =>
      candidate.studentId === studentId ? { ...candidate, ...changes } : candidate));
  }, []);

  const applyActionToAll = (action) => {
    setCandidates((current) => current.map((candidate) => ({ ...candidate, action })));
  };

  const clearSelection = () => {
    setSourceClassId('');
    setTargetClassId('');
    setTargetFeeCategory('EXISTING');
    setCandidates([]);
  };

  const validatePromotion = () => {
    if (!sourceClassId || !targetClassId) {
      notify('Please select both source and target classes', 'error');
      return false;
    }
    if (sourceClassId === targetClassId) {
      notify('Source and target classes cannot be the same', 'error');
      return false;
    }
    if (!candidates.length) {
      notify('No candidates available to promote', 'error');
      return false;
    }
    return true;
  };

  const executePromotion = async () => {
    setConfirmRun(false);
    setIsSubmitting(true);
    try {
      const { data } = await api.post('/promotions/batch', {
        fromClassId: sourceClassId,
        toClassId: targetClassId,
        targetFeeCategory: effectiveTargetFeeCategory,
        candidates: candidates.map(({ studentId, action }) => ({
          studentId, action,
        })),
      });
      notify(data.message || 'Rollover executed successfully');
      clearSelection();
    } catch (error) {
      notify(errMsg(error), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceClass = classes.find((item) => item._id === sourceClassId);
  const targetClass = classes.find((item) => item._id === targetClassId);
  const isPassoutTarget = /old|pass|alumni/i.test(targetClass?.name || '');
  const isPrePrimaryClass = (item) => isPrePrimaryClassName(item?.name || '');
  const isPrePrimaryRollover = isPrePrimaryClass(sourceClass) && isPrePrimaryClass(targetClass);
  const targetGrade = Number(String(targetClass?.name || '').match(/\d+/)?.[0]) || null;
  const isGradeOneTarget = targetGrade === 1;
  const isGradeFiveTarget = targetGrade === 5;
  const effectiveTargetFeeCategory = isPrePrimaryRollover || isGradeOneTarget
    ? 'NEW_ADMISSION'
    : isGradeFiveTarget ? targetFeeCategory : 'EXISTING';
  const promoteLabel = isPassoutTarget ? 'Pass Out' : 'Promote';
  const feeCategoryLabel = effectiveTargetFeeCategory === 'NEW_ADMISSION' ? 'New Admission Rate' : 'Existing Student Rate';
  const promoteCount = candidates.filter((candidate) => candidate.action === 'PROMOTE').length;
  const detainCount = candidates.length - promoteCount;
  const totalArrears = candidates.reduce((sum, candidate) => sum + (candidate.arrearAmount || 0), 0);

  const columns = useMemo(() => [
    { key: 'grNumber', label: 'GR Number', render: (row) => <b className="mono txt-primary">{row.grNumber}</b> },
    { key: 'fullName', label: 'Student Name', render: (row) => <b>{row.fullName}</b> },
    {
      key: 'arrearAmount', label: 'Outstanding Arrears',
      render: (row) => row.arrearAmount > 0
        ? <b className="txt-orange">{cur}{row.arrearAmount.toLocaleString()}</b>
        : <Badge value="Nil" color="bg-green" />,
    },
    {
      key: 'action', label: 'Decision', sortable: false, noExport: true,
      render: (row) => (
        <div className="promotion-decision" role="group" aria-label={`Promotion decision for ${row.fullName}`}>
          <button type="button" className={row.action === 'PROMOTE' ? 'selected promote' : ''} onClick={() => updateCandidate(row.studentId, { action: 'PROMOTE' })}>
            {isPassoutTarget ? <GraduationCap size={14} /> : <CheckCircle2 size={14} />}
            {promoteLabel}
          </button>
          <button type="button" className={row.action === 'RETAIN' ? 'selected retain' : ''} onClick={() => updateCandidate(row.studentId, { action: 'RETAIN' })}>
            <RotateCcw size={14} />
            Retain
          </button>
        </div>
      ),
    },
  ], [cur, isPassoutTarget, promoteLabel, updateCandidate]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2><ArrowUpDown size={20} /> Student Promotions</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Review every student before carrying balances into the next class.</p>
        </div>
        <div className="spacer" />
        {sourceClassId && (
          <button className="btn btn-blue" disabled={loadingCandidates} onClick={fetchCandidates}>
            <RefreshCw size={14} className={loadingCandidates ? 'animate-spin' : ''} /> Refresh Preview
          </button>
        )}
      </div>

      <div className="promotion-workflow">
      <FilterBar onClear={clearSelection}>
        <Field label="Source Class" required>
          <select value={sourceClassId} onChange={(event) => {
            setSourceClassId(event.target.value);
            if (event.target.value === targetClassId) setTargetClassId('');
          }}>
            <option value="">Select current class…</option>
            {classes.map((item) => <option key={item._id} value={item._id}>{formatClass(item)}</option>)}
          </select>
        </Field>
        <Field label="Target Class" required>
          <select value={targetClassId} disabled={!sourceClassId} onChange={(event) => {
            const nextId = event.target.value;
            const nextClass = classes.find((item) => item._id === nextId);
            const nextIsPrePrimary = isPrePrimaryClass(sourceClass) && isPrePrimaryClass(nextClass);
            const nextGrade = Number(String(nextClass?.name || '').match(/\d+/)?.[0]) || null;
            setTargetClassId(nextId);
            setTargetFeeCategory(nextIsPrePrimary || nextGrade === 1 || nextGrade === 5 ? 'NEW_ADMISSION' : 'EXISTING');
          }}>
            <option value="">Select next class…</option>
            {classes.filter((item) => item._id !== sourceClassId).map((item) => <option key={item._id} value={item._id}>{formatClass(item)}</option>)}
          </select>
        </Field>
        <Field label="Fee on Rollover">
          {isGradeFiveTarget && !isPassoutTarget ? (
            <div className="promotion-fee-choice" role="group" aria-label="Grade 5 fee category">
              <button type="button" className={targetFeeCategory === 'NEW_ADMISSION' ? 'selected' : ''} onClick={() => setTargetFeeCategory('NEW_ADMISSION')}>New Admission</button>
              <button type="button" className={targetFeeCategory === 'EXISTING' ? 'selected' : ''} onClick={() => setTargetFeeCategory('EXISTING')}>Existing</button>
            </div>
          ) : (
            <div className={`promotion-fee-lock ${isPassoutTarget ? 'arrears-only' : ''}`}>
              {isPassoutTarget ? <ShieldCheck size={15} /> : <CheckCircle2 size={15} />}
              {isPassoutTarget
                ? 'No new fee — arrears only'
                : effectiveTargetFeeCategory === 'NEW_ADMISSION' ? 'New Admission Rate' : 'Existing Student Rate'}
            </div>
          )}
        </Field>
      </FilterBar>

      {isPassoutTarget && (
        <div className="promotion-passout-note">
          <GraduationCap size={19} />
          <div><b>Grade 10 completion rollover</b><span>Students move to Old Students. No annual fee is added; only unpaid balances remain collectible.</span></div>
        </div>
      )}
      </div>

      <div className="kpi-grid">
        <KpiCard color="navy" icon={Users} value={candidates.length} label="Candidates" />
        <KpiCard color="green" icon={isPassoutTarget ? GraduationCap : CheckCircle2} value={promoteCount} label={isPassoutTarget ? 'Selected to Pass Out' : 'Selected to Promote'} />
        <KpiCard color="orange" icon={AlertCircle} value={detainCount} label="Selected to Retain" />
        <KpiCard color="teal" icon={Wallet} value={`${cur}${totalArrears.toLocaleString()}`} label="Arrears to Carry" />
      </div>

      {loadingCandidates ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: 42 }}>
          <Loader2 className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--primary)' }} />
          <span className="muted">Loading promotion preview…</span>
        </div>
      ) : (
        <>
          <div className="page-head" style={{ marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 15 }}>Promotion Decision Register</h3>
              <p className="small muted" style={{ marginTop: 3 }}>
                {sourceClass ? `${sourceClass.name} ${sourceClass.section}` : 'Select a source class to load students'}
                {targetClass ? ` → ${targetClass.name} ${targetClass.section}` : ''}
              </p>
            </div>
            <div className="spacer" />
            {!!candidates.length && (
              <>
                <div className="promotion-bulk-actions">
                  <button className="btn btn-sm btn-green" onClick={() => applyActionToAll('PROMOTE')}>
                    {isPassoutTarget ? <GraduationCap size={14} /> : <CheckCircle2 size={14} />} {promoteLabel} All
                  </button>
                  <button className="btn btn-sm btn-gray" onClick={() => applyActionToAll('RETAIN')}><RotateCcw size={14} /> Retain All</button>
                </div>
              </>
            )}
          </div>

          <DataTable columns={columns} rows={candidates} title="Student Promotion Register" exportName="student-promotions" defaultPageSize={25} />

          {!!candidates.length && (
            <div className="card card-pad" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div className="promotion-summary-copy" style={{ flex: 1, minWidth: 260 }}>
                <b>{promoteCount} students will be {isPassoutTarget ? 'moved to Old Students' : 'promoted'}; {detainCount} will remain in the current class.</b>
                <div className="small muted" style={{ marginTop: 3 }}>
                  {isPassoutTarget
                    ? 'No new fee will be added. Only each student’s current unpaid balance will remain.'
                    : `Promoted students use the ${effectiveTargetFeeCategory === 'NEW_ADMISSION' ? 'new-admission' : 'existing-student'} rate and unpaid balances carry forward.`}
                </div>
              </div>
              <button className="btn btn-navy promotion-execute-btn" disabled={isSubmitting || !targetClassId || !promoteCount} onClick={() => validatePromotion() && setConfirmRun(true)}>
                {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                {isSubmitting ? 'Executing Rollover…' : 'Review & Execute Rollover'}
              </button>
            </div>
          )}
        </>
      )}

      {confirmRun && (
        <Confirm
          title="Confirm Promotion Rollover"
          message={isPassoutTarget
            ? `Move ${promoteCount} student(s) from ${sourceClass?.name || 'Grade 10'} to Old Students and retain ${detainCount}? No new fee will be added; only existing unpaid balances remain.`
            : `Promote ${promoteCount} student(s) from ${sourceClass?.name || 'the source class'} to ${targetClass?.name || 'the target class'} using the ${feeCategoryLabel}, and retain ${detainCount}? Unpaid balances will carry forward.`}
          yesLabel={isPassoutTarget ? 'Confirm Pass Out' : 'Execute Rollover'}
          danger={false}
          onNo={() => setConfirmRun(false)}
          onYes={executePromotion}
        />
      )}
    </>
  );
}
