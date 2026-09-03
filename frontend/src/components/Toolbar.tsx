import { Search, X, ArrowUpDown, RotateCcw } from 'lucide-react';
import { FilterCategory, FilterStatus, SortOption } from '../types';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: FilterCategory;
  onCategoryChange: (cat: FilterCategory) => void;
  statusFilter: FilterStatus;
  onStatusChange: (status: FilterStatus) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  onResetFilters: () => void;
  isFiltered: boolean;
}

export function Toolbar({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  statusFilter,
  onStatusChange,
  sortOption,
  onSortChange,
  onResetFilters,
  isFiltered,
}: ToolbarProps) {
  const categoryOptions: FilterCategory[] = ['Todos', 'WordPress', 'Aplicación'];
  const statusOptions: FilterStatus[] = ['Todos', 'Activo', 'Inactivo'];

  return (
    <div id="catalog-toolbar" className="rounded-2xl border border-white/80 bg-white/50 backdrop-blur-md p-4 shadow-xs space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[280px]">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre, categoría o URL..."
            className="w-full rounded-xl border border-white/80 bg-white/70 backdrop-blur-xs py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white/95 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs transition-all"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600" title="Limpiar búsqueda">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="hidden sm:inline">Ordenar:</span>
            <select
              id="sort-select"
              value={sortOption}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="rounded-xl border border-white/80 bg-white/75 backdrop-blur-xs px-3 py-2 text-xs font-bold text-slate-800 shadow-2xs hover:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
            >
              <option value="name-asc">Nombre (A - Z)</option>
              <option value="name-desc">Nombre (Z - A)</option>
              <option value="newest">Más recientes</option>
            </select>
          </div>

          {isFiltered && (
            <button
              id="btn-reset-filters"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/70 backdrop-blur-xs px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-900 shadow-2xs transition-all cursor-pointer"
              title="Restablecer todos los filtros"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/50 pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider mr-1">Categoría:</span>
          <div className="inline-flex rounded-xl border border-white/70 bg-slate-200/40 backdrop-blur-xs p-0.5">
            {categoryOptions.map((cat) => (
              <button
                key={cat}
                id={`filter-cat-${cat.toLowerCase()}`}
                onClick={() => onCategoryChange(cat)}
                className={`rounded-lg px-3 py-1 font-semibold transition-all text-xs cursor-pointer ${
                  categoryFilter === cat ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider mr-1">Estado:</span>
          <div className="inline-flex rounded-xl border border-white/70 bg-slate-200/40 backdrop-blur-xs p-0.5">
            {statusOptions.map((st) => (
              <button
                key={st}
                id={`filter-status-${st.toLowerCase()}`}
                onClick={() => onStatusChange(st)}
                className={`rounded-lg px-3 py-1 font-semibold transition-all text-xs cursor-pointer ${
                  statusFilter === st ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
