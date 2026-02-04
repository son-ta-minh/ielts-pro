
import { useState, useCallback, useEffect } from 'react';
import { User, AppView } from '../types';
import { getAllUsers, saveUser, seedDatabaseIfEmpty } from '../db';
import { ADVENTURE_CHAPTERS } from '../../data/adventure_content';
import { generateMap } from '../../data/adventure_map';
import { restoreFromServer } from '../../services/backupService';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { DEFAULT_USER_ID } from '../../data/user_data';

export const useAuthAndUser = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [shouldSkipAuth, setShouldSkipAuth] = useState(false);

    const initApp = useCallback(async () => {
        setIsLoaded(false);
        setShouldSkipAuth(false);

        const savedUserId = localStorage.getItem('vocab_pro_current_user_id');
        const manualRestoreFlag = localStorage.getItem('vocab_pro_auto_restore');
        
        // Check current DB state
        let currentUsers = await getAllUsers();
        
        // --- SMART AUTO-RESTORE LOGIC ---
        // 1. Manual Flag: User clicked "Refresh" in Error Modal.
        // 2. Data Loss: DB is empty (users=0). We treat this as a signal to try restoring.
        //    If we have a savedUserId, use it. If not, use DEFAULT_USER_ID (assuming single-user server usage).
        const isDataLossDetected = currentUsers.length === 0;
        const shouldAttemptRestore = manualRestoreFlag === 'true' || isDataLossDetected;
        
        const targetRestoreId = savedUserId || DEFAULT_USER_ID;

        if (shouldAttemptRestore) {
            console.log(isDataLossDetected 
                ? `[Auth] Data loss detected (DB empty). Attempting auto-restore for ID: ${targetRestoreId}...` 
                : `[Auth] Manual restore flag detected. Attempting restore for ID: ${targetRestoreId}...`
            );

            // Set global flag to suppress "Unsaved Changes" highlight during bulk writes
            (window as any).isRestoring = true;

            try {
                // Attempt restore from server
                const success = await restoreFromServer(targetRestoreId);
                if (success) {
                    console.log("[Auth] Auto-restore successful.");
                    // Re-fetch users after successful restore to update state
                    currentUsers = await getAllUsers();
                    
                    // If we restored successfully but didn't have a saved ID, save it now so auto-login works
                    if (!savedUserId && currentUsers.length > 0) {
                         // Prefer the ID we just restored with, or the first user found
                         const restoredUser = currentUsers.find(u => u.id === targetRestoreId) || currentUsers[0];
                         if (restoredUser) {
                             localStorage.setItem('vocab_pro_current_user_id', restoredUser.id);
                         }
                    }
                } else {
                    console.warn("[Auth] Auto-restore failed or no backup found.");
                }
            } catch (e) {
                console.warn("[Auth] Auto-restore exception:", e);
            } finally {
                // Clear flag after a safety buffer to ensure events settle
                setTimeout(() => { (window as any).isRestoring = false; }, 2000);
            }
            
            // Clean up flag if it existed
            if (manualRestoreFlag) {
                localStorage.removeItem('vocab_pro_auto_restore');
            }
        }

        // --- SEEDING (If restore didn't happen or failed and DB is still empty) ---
        await seedDatabaseIfEmpty();
        
        // Re-fetch one last time to be sure we have the latest state (post-restore or post-seed)
        const allUsers = await getAllUsers();
        
        let userToLogin: User | null = null;
        
        // Refresh saved ID in case it changed during restore/seed
        const finalSavedId = localStorage.getItem('vocab_pro_current_user_id');

        if (allUsers.length === 1) {
            // Case 1: Only one user exists. Auto-login this user.
            userToLogin = allUsers[0];
            setShouldSkipAuth(true);
        } else if (finalSavedId && allUsers.length > 1) {
            // Case 2: Multiple users, but one was previously logged in.
            userToLogin = allUsers.find(u => u.id === finalSavedId) || null;
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
