import * as React from 'react'
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Tooltip,
    LinearProgress,
    Typography,
    Alert,
} from '@mui/material'
import {
    Close as CloseIcon,
    CloudUpload as CloudUploadIcon,
    Download as DownloadIcon,
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import LanguageDropdown from '../ui/LanguageDropdown'
import { translationGraph } from '../translation'
import { IsoLanguage } from '../translation/domain/IsoLanguage'
import { privacyPreferencesRepository } from '../persistence/PrivacyPreferencesRepository'
import { userPreferencesRepository } from '../persistence/UserPreferencesRepository'
import { API_URL } from '../config/api'

import * as styles from './FileUploadDialog.module.scss'

const ALLOWED_EXTENSIONS = [
    'inxml',
    'innopxml',
    'txt',
    'xml',
    'html',
    'htm',
    'docx',
    'odt',
    'pptx',
    'odp',
    'xlsx',
    'ods',
    'pdf',
    'srt',
    'md',
    'xlf',
    'json',
    'yaml',
]

export default function FileUploadDialog() {
    const [open, setOpen] = React.useState(false)
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
    const [sourceLanguage, setSourceLanguage] = React.useState<IsoLanguage>('cs')
    const [targetLanguage, setTargetLanguage] = React.useState<IsoLanguage>('uk')
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [translatedFileUrl, setTranslatedFileUrl] = React.useState<string | null>(null)
    const [translatedFileName, setTranslatedFileName] = React.useState<string | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const { t } = useTranslation()

    const sourceLanguages = translationGraph.getSourceLanguages()
    const targetLanguages = translationGraph.getReachableLanguagesFrom(sourceLanguage)

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const extension = file.name.split('.').pop()?.toLowerCase()
        if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
            setError(
                t('fileUpload:unsupportedFileType', {
                    extensions: ALLOWED_EXTENSIONS.join(', '),
                })
            )
            return
        }

        setSelectedFile(file)
        setError(null)
        setTranslatedFileUrl(null)
        setTranslatedFileName(null)
    }

    const handleUpload = async () => {
        if (!selectedFile) return

        setLoading(true)
        setError(null)
        setTranslatedFileUrl(null)
        setTranslatedFileName(null)

        try {
            const formData = new FormData()
            formData.append('input_text', selectedFile)

            const privacyPreferences = privacyPreferencesRepository.load()
            const userPreferences = userPreferencesRepository.load()

            const params = new URLSearchParams({
                src: sourceLanguage,
                tgt: targetLanguage,
                logInput: privacyPreferences?.allowsDataCollection ? 'true' : 'false',
                author: userPreferences.organizationName || '',
            })

            const response = await fetch(`${API_URL}&${params.toString()}`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                if (response.status === 415) {
                    throw new Error(t('fileUpload:unsupportedFileType', { extensions: ALLOWED_EXTENSIONS.join(', ') }))
                }
                if (response.status === 413) {
                    throw new Error(t('fileUpload:fileTooLarge'))
                }
                if (response.status === 504) {
                    throw new Error(t('fileUpload:timeout'))
                }
                throw new Error(t('fileUpload:uploadFailed'))
            }

            // Get the translated file as a blob
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)

            // Try to get filename from Content-Disposition header, otherwise generate it
            let translatedName: string
            const contentDisposition = response.headers.get('Content-Disposition')
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
                if (filenameMatch && filenameMatch[1]) {
                    translatedName = filenameMatch[1].replace(/['"]/g, '')
                } else {
                    // Fallback: generate filename
                    const originalName = selectedFile.name
                    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'))
                    const extension = originalName.substring(originalName.lastIndexOf('.'))
                    translatedName = `${nameWithoutExt}.${targetLanguage}${extension}`
                }
            } else {
                // Generate translated file name
                const originalName = selectedFile.name
                const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'))
                const extension = originalName.substring(originalName.lastIndexOf('.'))
                translatedName = `${nameWithoutExt}.${targetLanguage}${extension}`
            }

            setTranslatedFileUrl(url)
            setTranslatedFileName(translatedName)
        } catch (err) {
            setError(err instanceof Error ? err.message : t('fileUpload:uploadFailed'))
        } finally {
            setLoading(false)
        }
    }

    const handleDownload = () => {
        if (!translatedFileUrl || !translatedFileName) return

        const link = document.createElement('a')
        link.href = translatedFileUrl
        link.download = translatedFileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleClose = () => {
        if (loading) return // Don't close while uploading

        setOpen(false)
        setSelectedFile(null)
        setError(null)
        setTranslatedFileUrl(null)
        setTranslatedFileName(null)
        if (translatedFileUrl) {
            URL.revokeObjectURL(translatedFileUrl)
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleSourceLanguageChange = (newSource: IsoLanguage) => {
        setSourceLanguage(newSource)

        const newTargetLanguages = translationGraph.getReachableLanguagesFrom(newSource)
        if (!newTargetLanguages.includes(targetLanguage)) {
            setTargetLanguage(newTargetLanguages[0] || 'uk')
        }
    }

    const handleTargetLanguageChange = (newTarget: IsoLanguage) => {
        setTargetLanguage(newTarget)
    }

    React.useEffect(() => {
        return () => {
            if (translatedFileUrl) {
                URL.revokeObjectURL(translatedFileUrl)
            }
        }
    }, [translatedFileUrl])

    return (
        <>
            <Tooltip title={t('fileUpload:uploadFile')}>
                <IconButton
                    size="small"
                    edge="start"
                    aria-label="upload file"
                    onClick={() => setOpen(true)}
                >
                    <CloudUploadIcon />
                </IconButton>
            </Tooltip>

            <Dialog
                PaperProps={{
                    sx: { maxWidth: '600px', minWidth: '400px' },
                }}
                open={open}
                onClose={handleClose}
            >
                <DialogTitle>
                    {t('fileUpload:title')}
                    <IconButton
                        onClick={handleClose}
                        disabled={loading}
                        sx={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                {t('fileUpload:selectLanguages')}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <LanguageDropdown
                                    value={sourceLanguage}
                                    languages={sourceLanguages}
                                    onChange={handleSourceLanguageChange}
                                />
                                <Typography variant="body2">→</Typography>
                                <LanguageDropdown
                                    value={targetLanguage}
                                    languages={targetLanguages}
                                    onChange={handleTargetLanguageChange}
                                />
                            </Box>
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                {t('fileUpload:selectFile')}
                            </Typography>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                                id="file-upload-input"
                            />
                            <label htmlFor="file-upload-input">
                                <Button
                                    variant="outlined"
                                    component="span"
                                    startIcon={<CloudUploadIcon />}
                                    disabled={loading}
                                    fullWidth
                                >
                                    {selectedFile ? selectedFile.name : t('fileUpload:chooseFile')}
                                </Button>
                            </label>
                            <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                                {t('fileUpload:supportedFormats', {
                                    formats: ALLOWED_EXTENSIONS.join(', '),
                                })}
                            </Typography>
                        </Box>

                        {error && (
                            <Alert severity="error" onClose={() => setError(null)}>
                                {error}
                            </Alert>
                        )}

                        {loading && (
                            <Box>
                                <LinearProgress />
                                <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                                    {t('fileUpload:translating')}
                                </Typography>
                            </Box>
                        )}

                        {translatedFileUrl && translatedFileName && !loading && (
                            <Alert
                                severity="success"
                                action={
                                    <Button
                                        color="inherit"
                                        size="small"
                                        startIcon={<DownloadIcon />}
                                        onClick={handleDownload}
                                    >
                                        {t('fileUpload:download')}
                                    </Button>
                                }
                            >
                                {t('fileUpload:translationReady')}
                            </Alert>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} disabled={loading}>
                        {t('common:close')}
                    </Button>
                    <Button
                        onClick={handleUpload}
                        variant="contained"
                        disabled={!selectedFile || loading}
                    >
                        {t('fileUpload:uploadAndTranslate')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    )
}

