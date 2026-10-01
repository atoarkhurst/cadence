import { createContext, useContext } from 'react'

export const EncouragementContext = createContext({
  items: [],
  unreadCount: 0,
  status: 'loading',
  userId: null,
  read: async () => false,
})
export const useEncouragement = () => useContext(EncouragementContext)
