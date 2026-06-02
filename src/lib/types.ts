export interface Profile {
  id: string
  full_name: string
  initials: string
  color: string
}

export interface Section {
  id: string
  label: string
  icon: string
  parent_id: string | null
  sort_order: number
}

export interface Post {
  id: string
  section_id: string
  author_id: string
  content: string
  created_at: string
  profiles?: Profile
  comments?: Comment[]
}

export interface Comment {
  id: string
  post_id?: string
  document_id?: string
  author_id: string
  content: string
  created_at: string
  profiles?: Profile
}

export interface Document {
  id: string
  section_id: string
  author_id: string
  name: string
  storage_path: string
  mime_type: string
  size_bytes: number
  created_at: string
  profiles?: Profile
  comments?: Comment[]
}

export type SectionTree = Section & { children: SectionTree[] }

export function buildTree(sections: Section[]): SectionTree[] {
  const map = new Map<string, SectionTree>()
  sections.forEach(s => map.set(s.id, { ...s, children: [] }))
  const roots: SectionTree[] = []
  sections.forEach(s => {
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children.push(map.get(s.id)!)
    } else if (!s.parent_id) {
      roots.push(map.get(s.id)!)
    }
  })
  return roots
}
