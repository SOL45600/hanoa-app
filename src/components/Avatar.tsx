import { Profile } from '@/lib/types'

export default function Avatar({ profile, size = 32 }: { profile: Profile; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: profile.color + '22',
      border: `1.5px solid ${profile.color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 500, color: profile.color,
      flexShrink: 0, fontFamily: 'Georgia, serif',
    }}>
      {profile.initials}
    </div>
  )
}
