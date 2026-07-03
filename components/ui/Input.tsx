'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type FieldSize = 'sm' | 'md' | 'lg';

const fieldBase =
  'w-full font-sans text-base text-content-strong bg-white rounded-md border border-line-strong outline-none ' +
  'transition-[border-color,box-shadow] duration-fast ease-brand ' +
  'placeholder:text-content-muted ' +
  'focus:border-azure focus:shadow-focus ' +
  'disabled:opacity-55 disabled:bg-neutral-50';

const invalidCls = 'border-danger focus:border-danger focus:shadow-none';

const padBySize: Record<FieldSize, string> = {
  sm: 'px-3 py-2',
  md: 'px-3.5 py-[11px]',
  lg: 'px-4 py-[13px]',
};

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  sizeVariant?: FieldSize;
  invalid?: boolean;
  iconLeft?: ReactNode;
}

/** Single-line text input. Optional leading icon. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { sizeVariant = 'md', invalid = false, iconLeft, className, disabled, ...rest },
  ref,
) {
  if (iconLeft) {
    return (
      <div
        className={cn(
          'flex w-full items-center gap-2 ps-3 rounded-md border bg-white text-content-strong',
          'transition-[border-color,box-shadow] duration-fast ease-brand',
          'focus-within:border-azure focus-within:shadow-focus',
          invalid ? 'border-danger focus-within:border-danger focus-within:shadow-none' : 'border-line-strong',
          disabled && 'opacity-55 bg-neutral-50',
          className,
        )}
      >
        <span className="inline-flex text-steel shrink-0">{iconLeft}</span>
        <input
          ref={ref}
          disabled={disabled}
          className={cn('flex-1 min-w-0 border-none outline-none bg-transparent text-inherit ps-0', padBySize[sizeVariant])}
          {...rest}
        />
      </div>
    );
  }
  return (
    <input
      ref={ref}
      disabled={disabled}
      className={cn(fieldBase, padBySize[sizeVariant], invalid && invalidCls, className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line text input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, rows = 4, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(fieldBase, 'px-3.5 py-[11px] leading-normal resize-y', invalid && invalidCls, className)}
      {...rest}
    />
  );
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  sizeVariant?: FieldSize;
  invalid?: boolean;
}

/** Native select styled to the field base. For rich search use SearchableSelect. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { sizeVariant = 'md', invalid = false, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(fieldBase, padBySize[sizeVariant], 'pe-9 appearance-none cursor-pointer', invalid && invalidCls, className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236d6e71' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'left 12px center',
      }}
      {...rest}
    >
      {children}
    </select>
  );
});
