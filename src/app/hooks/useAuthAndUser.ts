
import { useState, useCallback, useEffect } from 'react';
import { User, AppView } from '../types';
import { getAllUsers, saveUser, seedDatabaseIfEmpty } from '../db';
import { ADVENTURE_CHAPTERS } from '../../data/adventure_content';

export const useAuthAndUser = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const initApp = useCallback(async () => {
        setIsLoaded(false);
        const seededUser = await seedDatabaseIfEmpty();
        const savedUserId = localStorage.getItem('vocab_pro_current_user_id');
        const allUsers = await getAllUsers();
        
        let userToLogin: User | null = null;

        if (savedUserId) {
            userToLogin = allUsers.find(u => u.id === savedUserId) || null;
        } else if (seededUser) {
            userToLogin = seededUser;
        }

        if (userToLogin) {
            let userNeedsSave = false;
            
            if (!userToLogin.adventure) {
                userToLogin.adventure = {
                    unlockedChapterIds: ADVENTURE_CHAPTERS.map(c => c.id),
                    completedSegmentIds: [],
                    segmentStars: {},
                    badges: [],
                    keys: 1,
                    keyFragments: 0
                };
                userNeedsSave = true;
            } else if (userToLogin.adventure.completedSegmentIds.length === 0 && userToLogin.adventure.keys === 0) {
                userToLogin.adventure.keys = 1;
                userNeedsSave = true;
            }
            
            if(userNeedsSave) {
                await saveUser(userToLogin);
            }
            
            setCurrentUser(userToLogin);
            localStorage.setItem('vocab_pro_current_user_id', userToLogin.id);
        }
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        initApp();
    }, [initApp]);

    const handleLogin = (user: User) => {
        setCurrentUser(user);
        localStorage.setItem('vocab_pro_current_user_id', user.id);
        const updated = { ...user, lastLogin: Date.now() };
        saveUser(updated);
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('vocab_pro_current_user_id');
    };

    const handleUpdateUser = async (updatedUser: User) => {
        await saveUser(updatedUser);
        setCurrentUser(updatedUser);
    };

    return { currentUser, isLoaded, handleLogin, handleLogout, handleUpdateUser, setCurrentUser };
};
