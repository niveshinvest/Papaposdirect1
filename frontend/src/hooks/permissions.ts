import { useEffect, useState } from "react"
import { authService } from "../services/supabaseService"

export function usePermissions() {
  const [permissions, setPermissions] = useState<any>(null)
  const [role, setRole] = useState<string>("")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const profile = await authService.getProfile()
        setPermissions(profile?.permissions || {})
        setRole(profile?.role || "")
      } catch (err) {
        console.error("Permission load error", err)
        setPermissions({})
      } finally {
        setLoaded(true)
      }
    }

    load()
  }, [])

  function can(permission: string) {
    if (!loaded) return false
    return permissions?.all || permissions?.[permission]
  }

  return {
    permissions,
    role,
    loaded,
    can,
  }
}
