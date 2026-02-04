const formatDate = (value, withTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined,
  }).format(date);
};

const statusLabel = (status) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status || 'Unknown';
  }
};

const statusClass = (status) => {
  switch (status) {
    case 'active':
      return 'pill pill--active';
    case 'completed':
      return 'pill pill--completed';
    case 'cancelled':
      return 'pill pill--cancelled';
    default:
      return 'pill';
  }
};

export default function PatientPortal({
  user,
  prescriptions,
  selectedId,
  prescriptionDetail,
  onSelect,
  onLogout,
  loadingList,
  loadingDetail,
  portalError,
}) {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <p className="portal-kicker">StayHealthy</p>
          <h1>My Prescriptions</h1>
          <p className="portal-subtitle">Welcome back, {user.email}</p>
        </div>
        <button className="portal-button portal-button--ghost" onClick={onLogout}>
          Sign out
        </button>
      </header>

      {portalError && <div className="portal-error">{portalError}</div>}

      <div className="portal-grid">
        <section className="portal-card">
          <div className="portal-card__header">
            <h2>Prescription History</h2>
            <span className="portal-muted">{prescriptions.length} records</span>
          </div>

          {loadingList ? (
            <div className="portal-loading">
              <span className="portal-spinner" /> Loading prescriptions...
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="portal-empty">No prescriptions yet.</div>
          ) : (
            <div className="portal-list">
              {prescriptions.map((prescription) => (
                <button
                  key={prescription.id}
                  type="button"
                  className={
                    prescription.id === selectedId
                      ? 'portal-list-item portal-list-item--active'
                      : 'portal-list-item'
                  }
                  onClick={() => onSelect(prescription.id)}
                >
                  <div>
                    <div className="portal-list-title">{prescription.doctor.name}</div>
                    <div className="portal-list-meta">
                      Issued {formatDate(prescription.issuedAt)}
                    </div>
                  </div>
                  <span className={statusClass(prescription.status)}>
                    {statusLabel(prescription.status)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="portal-card">
          <div className="portal-card__header">
            <h2>Prescription Detail</h2>
            {prescriptionDetail ? (
              <span className={statusClass(prescriptionDetail.status)}>
                {statusLabel(prescriptionDetail.status)}
              </span>
            ) : (
              <span className="portal-muted">Select a record</span>
            )}
          </div>

          {loadingDetail ? (
            <div className="portal-loading">
              <span className="portal-spinner" /> Loading detail...
            </div>
          ) : !prescriptionDetail ? (
            <div className="portal-empty">Choose a prescription to view details.</div>
          ) : (
            <div className="portal-detail">
              <div className="portal-detail-row">
                <div>
                  <div className="portal-detail-label">Prescribing Doctor</div>
                  <div className="portal-detail-value">{prescriptionDetail.doctor.name}</div>
                </div>
                <div>
                  <div className="portal-detail-label">Issued</div>
                  <div className="portal-detail-value">{formatDate(prescriptionDetail.issuedAt, true)}</div>
                </div>
                <div>
                  <div className="portal-detail-label">Expires</div>
                  <div className="portal-detail-value">{formatDate(prescriptionDetail.expiresAt)}</div>
                </div>
              </div>

              {prescriptionDetail.notes && (
                <div className="portal-note">{prescriptionDetail.notes}</div>
              )}

              <div className="portal-section-title">Medications</div>
              <div className="portal-medications">
                {(prescriptionDetail.items || []).map((item) => (
                  <div key={item.id} className="portal-medication">
                    <div className="portal-medication-header">
                      <div>
                        <div className="portal-medication-name">{item.name}</div>
                        <div className="portal-medication-meta">
                          {item.form ? `${item.form} · ` : ''}{item.strength || item.dose}
                        </div>
                      </div>
                      {item.quantity && <span className="pill pill--neutral">{item.quantity}</span>}
                    </div>
                    <div className="portal-medication-body">
                      <div>
                        <span className="portal-detail-label">Directions</span>
                        <div className="portal-detail-value">{item.instructions || '—'}</div>
                      </div>
                      <div>
                        <span className="portal-detail-label">Frequency</span>
                        <div className="portal-detail-value">{item.frequency || '—'}</div>
                      </div>
                      <div>
                        <span className="portal-detail-label">Duration</span>
                        <div className="portal-detail-value">{item.duration || '—'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
