import { useState, useCallback, useEffect } from 'react';
import { User, AppView } from '../types';
import { getAllUsers, saveUser, seedDatabaseIfEmpty } from '../db';
import { ADVENTURE_CHAPTERS } from '../../data/adventure_content';
import { generateMap } from '../../data/adventure_map';

export const useAuthAndUser = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [shouldSkipAuth, setShouldSkipAuth] = useState(false);

    const initApp = useCallback(async () => {
        setIsLoaded(false);
        setShouldSkipAuth(false);

        await seedDatabaseIfEmpty();
        
        const savedUserId = localStorage.getItem('vocab_pro_current_user_id');
        const allUsers = await getAllUsers();
        
        let userToLogin: User | null = null;

        if (allUsers.length === 1) {
            // Case 1: Only one user exists. Auto-login this user.
            userToLogin = allUsers[0];
            setShouldSkipAuth(true);
        } else if (savedUserId && allUsers.length > 1) {
            // Case 2: Multiple users, but one was previously logged in.
            userToLogin = allUsers.find(u => u.id === savedUserId) || null;
            if (userToLogin) {
                setShouldSkipAuth(true);
            }
        }
        // Case 3 (implicit): Multiple users, no saved user. userToLogin is null, shouldSkipAuth is false. App will show AuthView.

        if (userToLogin) {
            let userNeedsSave = false;
            
            if (!userToLogin.adventure) {
                userToLogin.adventure = {
                    currentNodeIndex: 0,
                    energy: 5,
                    energyShards: 0,
                    unlockedChapterIds: ADVENTURE_CHAPTERS.map(c => c.id),
                    completedSegmentIds: [],
                    segmentStars: {},
                    badges: [],
                    keys: 1,
                    keyFragments: 0,
                    map: generateMap(100)
                };
                userNeedsSave = true;
            } else {
                if (userToLogin.adventure.completedSegmentIds.length === 0 && (userToLogin.adventure.keys === 0 || userToLogin.adventure.keys === undefined)) {
                    userToLogin.adventure.keys = 1;
                    userNeedsSave = true;
                }
                if (!userToLogin.adventure.map) {
                    userToLogin.adventure.map = generateMap(100);
                    userNeedsSave = true;
                }
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

    const handleLogin = async (user: User) => {
        // Ensure new user logging in also has map generated
        if (!user.adventure.map) {
            user.adventure.map = generateMap(100);
            await saveUser(user);
        }
        
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

    return { currentUser, isLoaded, handleLogin, handleLogout, handleUpdateUser, setCurrentUser, shouldSkipAuth };
};