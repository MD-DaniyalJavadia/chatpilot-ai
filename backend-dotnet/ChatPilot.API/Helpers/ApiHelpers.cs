namespace ChatPilot.API.Helpers;

public static class PasswordHasher
{
    public static string Hash(string password) => BCrypt.Net.BCrypt.EnhancedHashPassword(password, 12);
    public static bool Verify(string password, string hash) => BCrypt.Net.BCrypt.EnhancedVerify(password, hash);
}

public sealed class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }

    public static ApiResponse<T> Ok(T data, string? message = null) => new() { Success = true, Data = data, Message = message };
    public static ApiResponse<T> Fail(string message) => new() { Success = false, Message = message };
}
