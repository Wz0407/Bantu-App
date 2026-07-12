using MyBantu.Domain.Contracts;

namespace MyBantu.Application;

/// <summary>
/// Explicit success/failure result used at application boundaries instead of exceptions.
/// </summary>
public sealed record AppResult<T>
{
    public bool Ok { get; }
    public T? Value { get; }
    public ErrorResponse? Error { get; }

    private AppResult(bool ok, T? value, ErrorResponse? error)
    {
        Ok = ok;
        Value = value;
        Error = error;
    }

    public static AppResult<T> Success(T value) => new(true, value, null);
    public static AppResult<T> Failure(ErrorResponse error) => new(false, default, error);
}
