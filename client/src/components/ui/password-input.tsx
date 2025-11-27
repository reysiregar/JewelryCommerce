import * as React from "react";
import { Input } from "@/components/ui/input";

type PasswordInputProps = React.ComponentProps<typeof Input>;

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className={`relative ${className || ""}`}>
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className="pr-10"
          {...props}
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-2 my-auto inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-10-8-10-8a18.4 18.4 0 0 1 5.06-6.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 10 8 10 8a18.38 18.38 0 0 1-3.23 4.62"/>
              <path d="M1 1l22 22"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s3-8 11-8 11 8 11 8-3 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
