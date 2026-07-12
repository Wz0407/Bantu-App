using System.Runtime.InteropServices;

namespace MyBantu.Infrastructure.Translation;

/// <summary>
/// Raw P/Invoke surface for the TriLingua C ABI (native/trilingua). All strings
/// cross the boundary as UTF-8. Result strings are library-owned and must be
/// released with <see cref="FreeResult"/> — this class is the only place that
/// touches native memory.
/// </summary>
internal static partial class TrilinguaNative
{
    private const string LibraryName = "trilingua";

    /// <summary>mb_status values (mirror of trilingua.h).</summary>
    internal enum Status
    {
        Ok = 0,
        InvalidArgument = 1,
        InvalidUtf8 = 2,
        UnsupportedLanguage = 3,
        NotInitialized = 4,
        EngineNotConfigured = 5,
        ModelLoadFailed = 6,
        InternalError = 7,
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MbTranslationRequest
    {
        public IntPtr Text;
        public IntPtr SourceLanguage;
        public IntPtr TargetLanguage;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MbTranslationResult
    {
        public int StatusCode;
        public IntPtr TranslatedText;
        public IntPtr DetectedLanguage;
        public double ElapsedMs;
        public IntPtr ModelVersion;
        public IntPtr ErrorMessage;
        public double DetectionConfidence;
    }

    private static string? _configuredLibraryPath;
    private static bool _resolverInstalled;

    /// <summary>
    /// Configures where trilingua(.dll/.so) is loaded from. Must be called before
    /// the first P/Invoke. Falls back to default OS probing when no path is set.
    /// </summary>
    internal static void ConfigureLibraryPath(string? absolutePath)
    {
        _configuredLibraryPath = absolutePath;
        if (_resolverInstalled)
        {
            return;
        }
        NativeLibrary.SetDllImportResolver(typeof(TrilinguaNative).Assembly, (name, assembly, searchPath) =>
        {
            if (name != LibraryName)
            {
                return IntPtr.Zero;
            }
            if (!string.IsNullOrEmpty(_configuredLibraryPath) && File.Exists(_configuredLibraryPath))
            {
                return NativeLibrary.Load(_configuredLibraryPath);
            }
            return NativeLibrary.TryLoad(LibraryName, assembly, searchPath, out var handle)
                ? handle
                : IntPtr.Zero;
        });
        _resolverInstalled = true;
    }

    [LibraryImport(LibraryName, EntryPoint = "mb_initialize")]
    private static partial int MbInitialize(IntPtr modelDirectory);

    [LibraryImport(LibraryName, EntryPoint = "mb_translate")]
    private static partial MbTranslationResult MbTranslate(in MbTranslationRequest request);

    [LibraryImport(LibraryName, EntryPoint = "mb_free_translation_result")]
    private static partial void MbFreeTranslationResult(ref MbTranslationResult result);

    [LibraryImport(LibraryName, EntryPoint = "mb_shutdown")]
    internal static partial void Shutdown();

    [LibraryImport(LibraryName, EntryPoint = "mb_health_check")]
    internal static partial int HealthCheck();

    [LibraryImport(LibraryName, EntryPoint = "mb_get_model_version")]
    private static partial int MbGetModelVersion(IntPtr buffer, int bufferSize);

    internal static Status Initialize(string modelDirectory)
    {
        var utf8Dir = Marshal.StringToCoTaskMemUTF8(modelDirectory);
        try
        {
            return (Status)MbInitialize(utf8Dir);
        }
        finally
        {
            Marshal.FreeCoTaskMem(utf8Dir);
        }
    }

    internal sealed record NativeTranslation(
        Status Status,
        string? TranslatedText,
        string? DetectedLanguage,
        double ElapsedMs,
        string? ModelVersion,
        string? ErrorMessage,
        double DetectionConfidence);

    internal static NativeTranslation Translate(string text, string sourceLanguage, string targetLanguage)
    {
        var request = new MbTranslationRequest
        {
            Text = Marshal.StringToCoTaskMemUTF8(text),
            SourceLanguage = Marshal.StringToCoTaskMemUTF8(sourceLanguage),
            TargetLanguage = Marshal.StringToCoTaskMemUTF8(targetLanguage),
        };
        var result = default(MbTranslationResult);
        try
        {
            result = MbTranslate(in request);
            return new NativeTranslation(
                (Status)result.StatusCode,
                Marshal.PtrToStringUTF8(result.TranslatedText),
                Marshal.PtrToStringUTF8(result.DetectedLanguage),
                result.ElapsedMs,
                Marshal.PtrToStringUTF8(result.ModelVersion),
                Marshal.PtrToStringUTF8(result.ErrorMessage),
                result.DetectionConfidence);
        }
        finally
        {
            MbFreeTranslationResult(ref result);
            Marshal.FreeCoTaskMem(request.Text);
            Marshal.FreeCoTaskMem(request.SourceLanguage);
            Marshal.FreeCoTaskMem(request.TargetLanguage);
        }
    }

    internal static string? GetModelVersion()
    {
        const int bufferSize = 256;
        var buffer = Marshal.AllocCoTaskMem(bufferSize);
        try
        {
            var status = (Status)MbGetModelVersion(buffer, bufferSize);
            return status == Status.Ok ? Marshal.PtrToStringUTF8(buffer) : null;
        }
        finally
        {
            Marshal.FreeCoTaskMem(buffer);
        }
    }
}
