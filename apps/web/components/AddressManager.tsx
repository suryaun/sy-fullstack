"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSession } from "next-auth/react";
import {
  createUserAddress,
  deleteUserAddress,
  listUserAddresses,
  setDefaultUserAddress,
  updateUserAddress,
  type AddressInput,
  type UserAddress,
} from "@/lib/api";

type Props = {
  title: string;
  emptyMessage: string;
  selectedAddressLabel?: string;
  compactSelectionMode?: boolean;
  lockInteractions?: boolean;
  lockMessage?: string;
  onSelectedAddressIdChange?: (addressId: string) => void;
};

export default function AddressManager({
  title,
  emptyMessage,
  selectedAddressLabel = "Selected",
  compactSelectionMode = false,
  lockInteractions = false,
  lockMessage = "Please wait for the current action to complete.",
  onSelectedAddressIdChange,
}: Props) {
  const { data: session, status } = useSession();
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressStatus, setAddressStatus] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressDeletingId, setAddressDeletingId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [isCompactExpanded, setIsCompactExpanded] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressInput>({
    fullName: "",
    phoneNumber: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
    addressType: "HOME",
    isDefault: false,
  });

  useEffect(() => {
    if (status !== "authenticated") {
      setAddresses([]);
      setSelectedAddressId("");
      return;
    }

    const loadAddresses = async () => {
      try {
        setAddressLoading(true);
        setAddressStatus("");
        const list = await listUserAddresses();
        setAddresses(list);

        const defaultId =
          list.find((address) => address.isDefault)?.id ?? list[0]?.id ?? "";

        setSelectedAddressId((previous) => {
          if (previous && list.some((address) => address.id === previous)) {
            return previous;
          }

          return defaultId;
        });
      } catch (error) {
        setAddressStatus(
          error instanceof Error ? error.message : "Unable to load addresses",
        );
      } finally {
        setAddressLoading(false);
      }
    };

    void loadAddresses();
  }, [status]);

  useEffect(() => {
    onSelectedAddressIdChange?.(selectedAddressId);
  }, [onSelectedAddressIdChange, selectedAddressId]);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );

  const showExpandedManager = !compactSelectionMode || isCompactExpanded;

  const resetAddressForm = () => {
    setAddressForm({
      fullName: session?.user?.name ?? "",
      phoneNumber: session?.user?.mobile ?? "",
      line1: "",
      line2: "",
      landmark: "",
      city: "",
      state: "",
      postalCode: "",
      country: "India",
      addressType: "HOME",
      isDefault: addresses.length === 0,
    });
  };

  const openCreateAddressForm = () => {
    if (lockInteractions) {
      setAddressStatus(lockMessage);
      return;
    }

    setEditingAddressId(null);
    resetAddressForm();
    setAddressFormOpen(true);
  };

  const openEditAddressForm = (address: UserAddress) => {
    if (lockInteractions) {
      setAddressStatus(lockMessage);
      return;
    }

    setEditingAddressId(address.id);
    setAddressForm({
      fullName: address.fullName,
      phoneNumber: address.phoneNumber,
      line1: address.line1,
      line2: address.line2 ?? "",
      landmark: address.landmark ?? "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      addressType: address.addressType ?? "HOME",
      isDefault: address.isDefault,
    });
    setAddressFormOpen(true);
  };

  const refreshAddresses = async (preferredId?: string) => {
    const list = await listUserAddresses();
    setAddresses(list);

    const defaultId =
      list.find((address) => address.isDefault)?.id ?? list[0]?.id ?? "";
    const nextSelected =
      (preferredId && list.some((address) => address.id === preferredId)
        ? preferredId
        : undefined) ??
      (selectedAddressId && list.some((address) => address.id === selectedAddressId)
        ? selectedAddressId
        : defaultId);
    setSelectedAddressId(nextSelected);
  };

  const submitAddressForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (lockInteractions) {
      setAddressStatus(lockMessage);
      return;
    }

    try {
      setAddressSaving(true);
      setAddressStatus("");

      const payload: AddressInput = {
        ...addressForm,
        fullName: addressForm.fullName.trim(),
        phoneNumber: addressForm.phoneNumber.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2?.trim() ?? "",
        landmark: addressForm.landmark?.trim() ?? "",
        city: addressForm.city.trim(),
        state: addressForm.state.trim(),
        postalCode: addressForm.postalCode.trim(),
        country: (addressForm.country ?? "India").trim(),
        addressType: (addressForm.addressType ?? "HOME").trim(),
        isDefault: Boolean(addressForm.isDefault),
      };

      if (editingAddressId) {
        const updated = await updateUserAddress(editingAddressId, payload);
        await refreshAddresses(updated.isDefault ? updated.id : undefined);
      } else {
        const created = await createUserAddress(payload);
        await refreshAddresses(created.id);
      }

      setAddressFormOpen(false);
      setEditingAddressId(null);
      if (compactSelectionMode) {
        setIsCompactExpanded(false);
      }
      setAddressStatus("Address saved");
    } catch (error) {
      setAddressStatus(
        error instanceof Error ? error.message : "Unable to save address",
      );
    } finally {
      setAddressSaving(false);
    }
  };

  const markAsDefault = async (addressId: string) => {
    if (lockInteractions) {
      setAddressStatus(lockMessage);
      return;
    }

    try {
      setAddressStatus("");
      const list = await setDefaultUserAddress(addressId);
      setAddresses(list);
      setSelectedAddressId(addressId);
      if (compactSelectionMode) {
        setIsCompactExpanded(false);
      }
      setAddressStatus("Default address updated");
    } catch (error) {
      setAddressStatus(
        error instanceof Error
          ? error.message
          : "Unable to set default address",
      );
    }
  };

  const removeAddress = async (addressId: string) => {
    if (lockInteractions) {
      setAddressStatus(lockMessage);
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this address?");
      if (!confirmed) {
        return;
      }
    }

    try {
      setAddressDeletingId(addressId);
      setAddressStatus("");

      const list = await deleteUserAddress(addressId);
      setAddresses(list);

      if (editingAddressId === addressId) {
        setAddressFormOpen(false);
        setEditingAddressId(null);
      }

      if (list.length === 0) {
        setSelectedAddressId("");
      } else if (!list.some((address) => address.id === selectedAddressId)) {
        const nextSelected =
          list.find((address) => address.isDefault)?.id ?? list[0].id;
        setSelectedAddressId(nextSelected);
      }

      if (compactSelectionMode && list.length > 0) {
        setIsCompactExpanded(false);
      }

      setAddressStatus("Address deleted");
    } catch (error) {
      setAddressStatus(
        error instanceof Error ? error.message : "Unable to delete address",
      );
    } finally {
      setAddressDeletingId(null);
    }
  };

  return (
    <section className="space-y-3 rounded border border-[#e4d9d0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">{title}</h2>
        {status === "authenticated" ? (
          compactSelectionMode ? (
            showExpandedManager ? (
              <button
                type="button"
                onClick={openCreateAddressForm}
                disabled={lockInteractions}
                className="rounded-sm border border-[#e4d9d0] px-3 py-1 text-[11px] disabled:opacity-50"
              >
                Add New
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (lockInteractions) {
                    setAddressStatus(lockMessage);
                    return;
                  }

                  setAddressStatus("");
                  setAddressFormOpen(false);
                  setEditingAddressId(null);
                  setIsCompactExpanded(true);
                }}
                disabled={lockInteractions}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[#e4d9d0] px-3 py-1 text-[11px] disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M3 21h6l11-11a2.1 2.1 0 0 0-3-3L6 18l-3 3Z" />
                  <path d="m14 6 4 4" />
                </svg>
                <span>Modify</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={openCreateAddressForm}
              disabled={lockInteractions}
              className="rounded-sm border border-[#e4d9d0] px-3 py-1 text-[11px] disabled:opacity-50"
            >
              Add New
            </button>
          )
        ) : null}
      </div>

      {status === "loading" ? (
        <p className="text-sm text-[#4e4038]">Checking account...</p>
      ) : null}

      {status === "unauthenticated" ? (
        <p className="text-sm text-[#4e4038]">
          Please log in to manage addresses.
        </p>
      ) : null}

      {status === "authenticated" && addressLoading ? (
        <p className="text-sm text-[#4e4038]">Loading saved addresses...</p>
      ) : null}

      {status === "authenticated" &&
      !addressLoading &&
      !showExpandedManager &&
      addresses.length === 0 ? (
        <p className="text-sm text-[#4e4038]">{emptyMessage}</p>
      ) : null}

      {status === "authenticated" && !addressLoading && addresses.length === 0 && showExpandedManager ? (
        <p className="text-sm text-[#4e4038]">{emptyMessage}</p>
      ) : null}

      {status === "authenticated" && !addressLoading && !showExpandedManager ? (
        selectedAddress ? (
          <div className="rounded-xl border border-wine bg-[#fff6f7] p-3 text-sm text-[#4f473f]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4e4038]">
              {selectedAddressLabel}
            </p>
            <p className="mt-1">
              <strong>{selectedAddress.fullName}</strong> ({selectedAddress.phoneNumber})
            </p>
            <p>
              {selectedAddress.line1}
              {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ""}
              {selectedAddress.landmark ? `, ${selectedAddress.landmark}` : ""}
            </p>
            <p>
              {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.postalCode}
            </p>
            <p>{selectedAddress.country}</p>
          </div>
        ) : null
      ) : null}

      {status === "authenticated" && addresses.length > 0 && showExpandedManager ? (
        <div className="space-y-2">
          {addresses.map((address) => {
            const selected = selectedAddressId === address.id;
            return (
              <div
                key={address.id}
                className={`rounded-xl border p-3 ${
                  selected ? "border-wine bg-[#fff6f7]" : "border-[#e4d8ca] bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="selectedAddress"
                      checked={selected}
                      disabled={lockInteractions}
                      onChange={() => {
                        setSelectedAddressId(address.id);
                        if (compactSelectionMode) {
                          setAddressFormOpen(false);
                          setEditingAddressId(null);
                          setIsCompactExpanded(false);
                        }
                      }}
                    />
                    <span className="text-sm text-[#4f473f]">
                      <strong>{address.fullName}</strong> ({address.phoneNumber})
                      <br />
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                      {address.landmark ? `, ${address.landmark}` : ""}
                      <br />
                      {address.city}, {address.state} - {address.postalCode}
                      <br />
                      {address.country}
                    </span>
                  </label>
                  <div className="flex flex-col items-end gap-2">
                    {address.isDefault ? (
                      <span className="rounded-sm bg-[#f5f1eb] px-2 py-1 text-xs uppercase tracking-[0.1em] text-[#5c4a42]">
                        Default
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void markAsDefault(address.id)}
                        disabled={lockInteractions}
                        className="rounded-sm border border-[#e4d9d0] px-2 py-1 text-xs uppercase tracking-[0.1em] text-[#5c4e44] disabled:opacity-50"
                      >
                        Make Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditAddressForm(address)}
                      disabled={lockInteractions}
                      className="rounded-sm border border-[#e4d9d0] px-2 py-1 text-xs uppercase tracking-[0.1em] text-[#5c4e44] disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeAddress(address.id)}
                      disabled={addressDeletingId === address.id || lockInteractions}
                      className="rounded-sm border border-[#e4d9d0] px-2 py-1 text-xs uppercase tracking-[0.1em] text-[#5c4e44] disabled:opacity-50"
                    >
                      {addressDeletingId === address.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {status === "authenticated" && addressFormOpen && showExpandedManager ? (
        <form
          onSubmit={submitAddressForm}
          className="grid gap-2 rounded-xl border border-[#e4d8ca] bg-white p-3 text-sm"
        >
          <input
            type="text"
            value={addressForm.fullName}
            disabled={lockInteractions || addressSaving}
            onChange={(event) =>
              setAddressForm((prev) => ({ ...prev, fullName: event.target.value }))
            }
            placeholder="Full name"
            className="rounded-lg border border-[#d7c9b7] p-2"
            required
          />
          <input
            type="tel"
            value={addressForm.phoneNumber}
            disabled={lockInteractions || addressSaving}
            onChange={(event) =>
              setAddressForm((prev) => ({ ...prev, phoneNumber: event.target.value }))
            }
            placeholder="Phone number"
            className="rounded-lg border border-[#d7c9b7] p-2"
            required
          />
          <input
            type="text"
            value={addressForm.line1}
            disabled={lockInteractions || addressSaving}
            onChange={(event) =>
              setAddressForm((prev) => ({ ...prev, line1: event.target.value }))
            }
            placeholder="Address line 1"
            className="rounded-lg border border-[#d7c9b7] p-2"
            required
          />
          <input
            type="text"
            value={addressForm.line2}
            disabled={lockInteractions || addressSaving}
            onChange={(event) =>
              setAddressForm((prev) => ({ ...prev, line2: event.target.value }))
            }
            placeholder="Address line 2 (optional)"
            className="rounded-lg border border-[#d7c9b7] p-2"
          />
          <input
            type="text"
            value={addressForm.landmark}
            disabled={lockInteractions || addressSaving}
            onChange={(event) =>
              setAddressForm((prev) => ({ ...prev, landmark: event.target.value }))
            }
            placeholder="Landmark (optional)"
            className="rounded-lg border border-[#d7c9b7] p-2"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={addressForm.city}
              disabled={lockInteractions || addressSaving}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, city: event.target.value }))
              }
              placeholder="City"
              className="rounded-lg border border-[#d7c9b7] p-2"
              required
            />
            <input
              type="text"
              value={addressForm.state}
              disabled={lockInteractions || addressSaving}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, state: event.target.value }))
              }
              placeholder="State"
              className="rounded-lg border border-[#d7c9b7] p-2"
              required
            />
            <input
              type="text"
              value={addressForm.postalCode}
              disabled={lockInteractions || addressSaving}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, postalCode: event.target.value }))
              }
              placeholder="Postal code"
              className="rounded-lg border border-[#d7c9b7] p-2"
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={addressForm.country}
              disabled={lockInteractions || addressSaving}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, country: event.target.value }))
              }
              placeholder="Country"
              className="rounded-lg border border-[#d7c9b7] p-2"
            />
            <input
              type="text"
              value={addressForm.addressType}
              disabled={lockInteractions || addressSaving}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, addressType: event.target.value }))
              }
              placeholder="Address type (HOME/WORK)"
              className="rounded-lg border border-[#d7c9b7] p-2"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#4e4038]">
            <input
              type="checkbox"
              checked={Boolean(addressForm.isDefault)}
              disabled={lockInteractions || addressSaving}
              onChange={(event) =>
                setAddressForm((prev) => ({
                  ...prev,
                  isDefault: event.target.checked,
                }))
              }
            />
            Set as default address
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={addressSaving || lockInteractions}
              className="rounded-sm bg-ink px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-[#faf8f5] disabled:opacity-50"
            >
              {addressSaving
                ? "Saving..."
                : editingAddressId
                  ? "Update Address"
                  : "Save Address"}
            </button>
            <button
              type="button"
              disabled={lockInteractions || addressSaving}
              onClick={() => {
                setAddressFormOpen(false);
                setEditingAddressId(null);
              }}
              className="rounded-sm border border-[#e4d9d0] px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-[#5c4e44]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {status === "authenticated" && selectedAddress && showExpandedManager ? (
        <p className="text-xs text-[#4e4038]">
          {selectedAddressLabel}: {selectedAddress.fullName}, {selectedAddress.line1},{" "}
          {selectedAddress.city} - {selectedAddress.postalCode}
        </p>
      ) : null}

      {addressStatus ? (
        <p className="text-xs text-[#4e4038]">{addressStatus}</p>
      ) : null}
    </section>
  );
}
