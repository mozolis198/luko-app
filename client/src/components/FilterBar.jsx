export default function FilterBar({ filters, onChange, onReset }) {
  return (
    <section className="panel">
      <h3>Filtrai</h3>
      <div className="grid two-col">
        <label>
          Tipas
          <select value={filters.type} onChange={(e) => onChange('type', e.target.value)}>
            <option value="">Visi</option>
            <option value="jega">Jega</option>
            <option value="kardio">Kardio</option>
            <option value="tempimas">Tempimas</option>
          </select>
        </label>
        <label>
          Sunkumas
          <select value={filters.difficulty} onChange={(e) => onChange('difficulty', e.target.value)}>
            <option value="">Visi</option>
            <option value="pradedantis">Pradedantis</option>
            <option value="vidutinis">Vidutinis</option>
            <option value="pazenges">Pazenges</option>
          </select>
        </label>
        <label>
          Raumenys
          <input
            value={filters.muscle_group}
            onChange={(e) => onChange('muscle_group', e.target.value)}
            placeholder="nugara"
          />
        </label>
        <label>
          Inventorius
          <input
            value={filters.equipment}
            onChange={(e) => onChange('equipment', e.target.value)}
            placeholder="hanteliai"
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.bench_focus}
            onChange={(e) => onChange('bench_focus', e.target.checked)}
          />
          Tik suolio pratimai
        </label>
      </div>
      <button type="button" className="btn ghost" onClick={onReset}>
        Isvalyti
      </button>
    </section>
  );
}
