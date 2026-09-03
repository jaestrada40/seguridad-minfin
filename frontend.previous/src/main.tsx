import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Portal = { id: number; name: string; category: string; url: string; username: string; status: string }

function App() {
  const [items, setItems] = useState<Portal[]>([])
  const [search, setSearch] = useState('')
  useEffect(() => { fetch(`/api/portals?search=${encodeURIComponent(search)}`).then(r => r.json()).then(setItems) }, [search])
  return <main>
    <header><div><span className="eyebrow">SECUREVAULT LOCAL</span><h1>Portales internos</h1><p>Catálogo seguro de accesos institucionales</p></div><span className="badge">● Entorno local</span></header>
    <section className="stats"><div><small>Registros visibles</small><strong>{items.length}</strong></div><div><small>WordPress</small><strong>{items.filter(i => i.category === 'WordPress').length}</strong></div><div><small>Aplicaciones</small><strong>{items.filter(i => i.category === 'Aplicación').length}</strong></div></section>
    <section className="toolbar"><input placeholder="Buscar por nombre, categoría o URL..." value={search} onChange={e => setSearch(e.target.value)} /><span>Las contraseñas reales todavía no se almacenan</span></section>
    <section className="grid">{items.map(item => <article className="card" key={item.id}><div className="card-top"><span className="category">{item.category}</span><span className="status">{item.status}</span></div><h2>{item.name}</h2><a href={item.url} target="_blank">{item.url}</a><div className="user"><small>Usuario de demostración</small><b>{item.username}</b></div><button disabled>Copiar contraseña</button></article>)}</section>
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

