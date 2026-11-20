import { useStore } from './store'
import Home from './Home'
import Editor from './Editor'

export default function App() {
  const design = useStore((s) => s.design)
  return design ? <Editor /> : <Home />
}
