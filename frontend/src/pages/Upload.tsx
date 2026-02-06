import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Sparkles, Lock } from 'lucide-react';
import { uploadStatement } from '../api/client';
import type { Statement } from '../types';
import clsx from 'clsx';
import { useProcessing } from '../contexts/ProcessingContext';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error' | 'password-required';

export default function UploadPage() {
    const navigate = useNavigate();
    const { trackUpload } = useProcessing();
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [uploadedStatement, setUploadedStatement] = useState<Statement | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [password, setPassword] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleUpload = async (file: File, pwd?: string) => {
        setStatus('uploading');
        setError(null);

        try {
            const statement = await uploadStatement(file, pwd);
            setUploadedStatement(statement);
            trackUpload(statement.id, statement.filename);
            setStatus('success');
            // Clear password on success
            setPassword('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload failed';

            if (msg === 'PASSWORD_REQUIRED' || msg === 'INVALID_PASSWORD') {
                setStatus('password-required');
                setSelectedFile(file);
                if (msg === 'INVALID_PASSWORD') {
                    setError('Incorrect password, please try again.');
                } else {
                    setError(null);
                }
            } else {
                setError(msg);
                setStatus('error');
            }
        }
    };

    const handleFile = useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setError('Please upload a PDF file');
            setStatus('error');
            return;
        }

        // Reset password state for new file
        setPassword('');
        setSelectedFile(file);
        handleUpload(file);
    }, []);

    const submitPassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedFile && password) {
            handleUpload(selectedFile, password);
        }
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);

            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
            }
        },
        [handleFile]
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            e.preventDefault();
            if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
            }
        },
        [handleFile]
    );

    const resetUpload = () => {
        setStatus('idle');
        setError(null);
        setUploadedStatement(null);
    };

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            <h1 className="text-2xl font-semibold text-foreground mb-6">
                Upload Statement
            </h1>

            {status === 'success' && uploadedStatement ? (
                <div className="bg-card rounded-xl border border-border p-8 max-w-xl mx-auto shadow-sm">
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                            <CheckCircle className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            Upload Successful!
                        </h2>
                        <p className="text-muted-foreground mb-6">
                            Your statement has been uploaded and processing has started. You will receive a notification when it completes.
                        </p>

                        <div className="bg-muted/50 rounded-xl p-4 mb-6 text-left border border-border">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-card rounded-lg border border-border">
                                    <FileText className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">
                                        {uploadedStatement.filename}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {formatFileSize(uploadedStatement.file_size)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => navigate(`/statements/${uploadedStatement.id}`)}
                                className="btn btn-primary px-5 py-2.5"
                            >
                                View Statement
                            </button>
                            <button
                                onClick={resetUpload}
                                className="btn btn-secondary px-5 py-2.5"
                            >
                                Upload Another
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-xl mx-auto">
                    <div
                        className={clsx(
                            'border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200',
                            dragActive
                                ? 'border-primary bg-primary/5 scale-[1.02]'
                                : status === 'error'
                                    ? 'border-destructive/50 bg-destructive/5'
                                    : 'border-border bg-card hover:border-muted-foreground/50'
                        )}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        {status === 'uploading' ? (
                            <>
                                <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                                <p className="text-lg font-medium text-foreground">
                                    Uploading...
                                </p>
                                <p className="text-muted-foreground mt-1">
                                    Please wait while we process your file
                                </p>
                            </>
                        ) : status === 'password-required' ? (
                            <form onSubmit={submitPassword} className="max-w-xs mx-auto">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
                                    <Lock className="w-8 h-8 text-amber-600" />
                                </div>
                                <h3 className="text-lg font-medium text-foreground mb-2">Password Protected</h3>
                                <p className="text-muted-foreground text-sm mb-4">
                                    {error || "This PDF is encrypted. Please enter the password to unlock it."}
                                </p>
                                <div className="space-y-3">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter PDF password"
                                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={resetUpload}
                                            className="flex-1 btn btn-secondary py-2"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 btn btn-primary py-2"
                                            disabled={!password}
                                        >
                                            Unlock
                                        </button>
                                    </div>
                                </div>
                            </form>
                        ) : status === 'error' ? (
                            <>
                                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                                <p className="text-lg font-medium text-destructive">{error}</p>
                                <button
                                    onClick={resetUpload}
                                    className="btn mt-4 px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20"
                                >
                                    Try Again
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                                    <Upload className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <p className="text-lg font-medium text-foreground mb-1">
                                    Drop your statement here
                                </p>
                                <p className="text-muted-foreground mb-4">or click to browse</p>
                                <label className="btn btn-primary px-5 py-2.5 cursor-pointer">
                                    Select PDF
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={handleChange}
                                        className="hidden"
                                    />
                                </label>
                                <p className="text-xs text-muted-foreground mt-4">
                                    Supported: PDF files up to 50MB
                                </p>
                            </>
                        )}
                    </div>

                    <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-5">
                        <div className="flex items-start gap-3">
                            <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <h3 className="font-medium text-foreground mb-2">AI-Powered Parsing</h3>
                                <ul className="text-sm text-muted-foreground space-y-1.5">
                                    <li>• Upload credit card statements in PDF format</li>
                                    <li>• Transactions are extracted using Gemini AI</li>
                                    <li>• Categories are auto-suggested based on merchant</li>
                                    <li>• Duplicate files are automatically detected</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
