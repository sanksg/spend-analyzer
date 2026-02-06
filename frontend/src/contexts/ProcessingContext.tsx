import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { getStatement } from '../api/client';

interface ProcessingContextType {
    trackUpload: (id: number, filename: string) => void;
}

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export function useProcessing() {
    const context = useContext(ProcessingContext);
    if (!context) {
        throw new Error('useProcessing must be used within a ProcessingProvider');
    }
    return context;
}

interface TrackedUpload {
    id: number;
    filename: string;
}

export function ProcessingProvider({ children }: { children: ReactNode }) {
    const [uploads, setUploads] = useState<TrackedUpload[]>([]);

    const trackUpload = (id: number, filename: string) => {
        setUploads(prev => [...prev, { id, filename }]);
        // Toast for started
        toast('Processing started...', {
             icon: '⏳',
             duration: 3000
        });
    };

    useEffect(() => {
        if (uploads.length === 0) return;

        const interval = setInterval(async () => {
            const remaining: TrackedUpload[] = [];

            for (const upload of uploads) {
                try {
                    const stmt = await getStatement(upload.id);
                    if (stmt.status === 'completed' || stmt.status === 'needs_review') {
                        toast.success(`${upload.filename} processed successfully!`);
                    } else if (stmt.status === 'failed') {
                        toast.error(`Failed to process ${upload.filename}`);
                    } else {
                        // Still processing
                        remaining.push(upload);
                    }
                } catch (e) {
                    // Error fetching, maybe network, keep trying
                    remaining.push(upload);
                }
            }

            setUploads(remaining);
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, [uploads]);

    return (
        <ProcessingContext.Provider value={{ trackUpload }}>
            {children}
        </ProcessingContext.Provider>
    );
}
